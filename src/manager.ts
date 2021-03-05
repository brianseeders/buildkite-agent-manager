import PromisePool from '@supercharge/promise-pool';
import { getConfig, GcpAgentConfiguration, AgentConfiguration } from './agentConfig';
import { createInstance, deleteInstance, GcpInstance, getAllAgentInstances, getImageForFamily } from './gcp';
import { Agent, AgentMetrics, Buildkite } from './buildkite';
import logger from './lib/logger';

// TODO should this be purely functional?
const buildkite = new Buildkite();

export interface ManagerContext {
  config: AgentConfiguration;
  buildkiteAgents: Agent[];
  buildkiteQueues: Record<string, AgentMetrics>;
  gcpInstances: GcpInstance[];
}

export interface AgentConfigToCreate {
  config: GcpAgentConfiguration;
  numberToCreate: number;

  // Below is really just for informational purposes
  jobs: number;
  totalAgentsDesired: number;
  currentAgents: number;
}

export interface ExecutionPlan {
  agentsToStop?: any[];
  gcp?: {
    instancesToDelete?: GcpInstance[];
    agentConfigsToCreate?: AgentConfigToCreate[];
  };
}

async function withPromisePool(size, items, func) {
  return await PromisePool.for(items)
    .withConcurrency(size)
    .handleError(async (error) => {
      // This will cause the pool to stop creating instances after the first error
      throw error;
    })
    .process(func);
}

export async function getAllQueues(configs: GcpAgentConfiguration[]) {
  const queueSet = new Set<string>();
  for (const config of configs) {
    queueSet.add(config.queue);
  }

  const queues = [...queueSet];
  const results = await Promise.all(queues.map((queue) => buildkite.getAgentMetrics(queue)));
  const queuesByKey = {} as Record<string, AgentMetrics>;
  for (const key in queues) {
    queuesByKey[queues[key]] = results[key];
  }

  return queuesByKey;
}

export async function getAllImages(projectId: string, configs: GcpAgentConfiguration[]) {
  const uniqueFamilies = [...new Set(configs.map((c) => c.imageFamily).filter((f) => f))];
  const families = {};
  for (const family of uniqueFamilies) {
    families[family] = (await getImageForFamily(projectId, family)).name;
  }

  return families as Record<string, string>;
}

export function getAgentConfigsToCreate(context: ManagerContext) {
  const toCreate: AgentConfigToCreate[] = [];
  const agents = context.config.gcp.agents;

  for (const agent of agents) {
    const queue = context.buildkiteQueues[agent.queue];
    const jobs = queue ? queue.jobs.running + queue.jobs.scheduled : 0;

    const instances = context.gcpInstances.filter(
      (f) =>
        ['PROVISIONING', 'STAGING', 'RUNNING'].includes(f.metadata.status) &&
        f.metadata.metadata.items.find((i) => i.key === 'buildkite-agent-name' && i.value === agent.name)
    );
    const currentAgents = Math.max(instances.length, queue.agents.total);

    let agentsNeeded = jobs;
    if (agent.minimumAgents) {
      agentsNeeded = Math.max(agentsNeeded, agent.minimumAgents);
    }

    if (agent.overprovision) {
      // overprovision < 1 is a percentage amount, >= 1 is a discrete amount
      const overprovisionAmount = agent.overprovision < 1 ? Math.ceil(agentsNeeded * agent.overprovision) : agent.overprovision;
      agentsNeeded = agentsNeeded + overprovisionAmount;
    }

    if (agent.maximumAgents) {
      agentsNeeded = Math.min(agentsNeeded, agent.maximumAgents);
    }

    const numberToCreate = agentsNeeded - currentAgents;
    if (numberToCreate > 0) {
      toCreate.push({
        config: agent,
        numberToCreate: numberToCreate,
        jobs: jobs,
        totalAgentsDesired: agentsNeeded,
        currentAgents: currentAgents,
      });
    }
  }

  return toCreate;
}

export function getStoppedInstances(context: ManagerContext) {
  const instances = context.gcpInstances.filter((i) => i.metadata.status === 'TERMINATED');
  return instances;
}

// Agents with an instance created by an old version of a config
export function getStaleAgents(context: ManagerContext) {
  const agents = [];
  for (const agentConfig of context.config.gcp.agents) {
    const hash = agentConfig.hash();

    context.buildkiteAgents
      .filter((agent) => agent.connection_state === 'connected')
      .filter((agent) => agent.meta_data?.includes(`queue=${agentConfig.queue}`))
      .filter((agent) => !agent.meta_data?.includes(`hash=${hash}`))
      .forEach((agent) => agents.push(agent));
  }

  return agents;
}

export function createPlan(context: ManagerContext) {
  const plan: ExecutionPlan = {
    gcp: {
      instancesToDelete: getStoppedInstances(context), // deleted instances and instances past the hard-stop limit
      agentConfigsToCreate: getAgentConfigsToCreate(context),
    },
    agentsToStop: getStaleAgents(context), // agents attached to outdated configs, or ones that have reached their configed soft time limit
    // also, if there are too many agents of a given type, order than by name or creation and soft stop the extras
  };

  return plan;
}

export async function createInstances(context: ManagerContext, toCreate: AgentConfigToCreate) {
  logger.info(`Creating ${toCreate.numberToCreate} instances of`, toCreate.config);

  try {
    await withPromisePool(25, new Array(toCreate.numberToCreate), async () => {
      await createInstance(toCreate.config);
      return true;
    });
  } finally {
    logger.info('Done creating instances');
  }
}

export async function deleteInstances(instances: GcpInstance[]) {
  logger.info(`Deleting ${instances.length} instances: ${instances.map((i) => i.metadata.name).join(', ')}`);

  try {
    await withPromisePool(10, instances, async (instance) => {
      await deleteInstance(instance);
      return true;
    });
  } finally {
    logger.info('Done deleting instances');
  }
}

export async function stopAgents(agents: Agent[]) {
  logger.info(`Stopping ${agents.length} agents: ${agents.map((a) => a.name).join(', ')}`);

  try {
    await withPromisePool(5, agents, async (agent) => {
      await buildkite.stopAgent(agent);
      return true;
    });
  } finally {
    logger.info('Done stopping agents');
  }
}

export async function executePlan(context: ManagerContext, plan: ExecutionPlan) {
  const promises: Promise<any>[] = [];

  if (plan.gcp.agentConfigsToCreate?.length) {
    for (const config of plan.gcp.agentConfigsToCreate) {
      promises.push(createInstances(context, config));
    }
  }

  if (plan.gcp.instancesToDelete?.length) {
    promises.push(deleteInstances(plan.gcp.instancesToDelete));
  }

  if (plan.agentsToStop?.length) {
    promises.push(stopAgents(plan.agentsToStop));
  }

  await Promise.all(promises);
}

export async function run() {
  const config = await getConfig();

  logger.debug('Gathering data for current state');
  const [agents, instances, queues, imagesFromFamilies] = await Promise.all([
    buildkite.getAgents(),
    getAllAgentInstances(config.gcp),
    getAllQueues(config.gcp.agents),
    getAllImages(config.gcp.project, config.gcp.agents),
  ]);
  logger.debug('Finished gathering data for current state');

  config.gcp.agents.forEach((agent) => {
    if (agent.imageFamily && !agent.image) {
      agent.image = imagesFromFamilies[agent.imageFamily];
    }
  });

  const context: ManagerContext = {
    config: config,
    buildkiteAgents: agents,
    gcpInstances: instances,
    buildkiteQueues: queues,
  };

  const plan = createPlan(context);

  logger.debug('Plan', plan);

  await executePlan(context, plan);
}
