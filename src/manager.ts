import { TopLevelConfig, getConfig, getAgentConfigs, GcpAgentConfiguration, AgentConfiguration } from './agentConfig';
import { createInstance, deleteInstance, GcpInstance, getAllAgentInstances } from './gcp';
import { AgentMetrics, Buildkite } from './buildkite';
import { exec } from 'child_process';
import logger from './lib/logger';

// TODO should this be purely functional?
const buildkite = new Buildkite();

export interface ManagerContext {
  config: AgentConfiguration;
  buildkiteAgents: any[];
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

export function createPlan(context: ManagerContext) {
  const plan: ExecutionPlan = {
    gcp: {
      instancesToDelete: getStoppedInstances(context), // deleted instances and instances past the hard-stop limit
      agentConfigsToCreate: getAgentConfigsToCreate(context),
    },
    agentsToStop: [], // agents attached to outdated configs, or ones that have reached their configed soft time limit
    // also, if there are too many agents of a given type, order than by name or creation and soft stop the extras
  };

  return plan;
}

// TODO do them in batches?
export async function createInstances(context: ManagerContext, toCreate: AgentConfigToCreate) {
  logger.info(`Creating ${toCreate.numberToCreate} instances of`, toCreate.config);
  for (let i = 0; i < toCreate.numberToCreate; i++) {
    // console.log(`Would create #${i + 1}:`, toCreate);
    await createInstance(toCreate.config);
  }
}

export async function deleteInstances(instances: GcpInstance[]) {
  logger.info(`Deleting ${instances.length} instances: ${instances.map((i) => i.metadata.name).join(', ')}`);

  for (const instance of instances) {
    await deleteInstance(instance);
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

  await Promise.all(promises);
}

export async function run() {
  const config = await getConfig();
  // const agentConfigs = await getAgentConfigs();

  // TODO tie the relevant agents and instances together
  const [agents, instances, queues] = await Promise.all([
    buildkite.getAgents(),
    getAllAgentInstances(config.gcp),
    getAllQueues(config.gcp.agents),
  ]);

  const context: ManagerContext = {
    config: config,
    buildkiteAgents: agents as any[],
    gcpInstances: instances,
    buildkiteQueues: queues,
  };

  const plan = createPlan(context);

  logger.debug(plan);
  await executePlan(context, plan);
}
