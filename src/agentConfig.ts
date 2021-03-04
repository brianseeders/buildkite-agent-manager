// export type GcpAgentConfig = {
//   project?: string;
//   zone?: string;
//   serviceAccount?: string;

import logger from './lib/logger';

import crypto from 'crypto';

//   queue?: string;
//   name?: string;
//   overprovision?: number;
//   minimumAgents?: number;
//   idleTimeoutSecs?: number;
//   exitAfterOneJob?: boolean;
//   image?: string;
//   machineType?: string;
//   diskType?: string;
//   diskSizeGb?: number;
//   startupScript?: string;
//   tags?: string[];
//   metadata?: Record<string, string>;
// };

export type GcpTopLevelConfig = Partial<GcpAgentConfiguration> & {
  project: string;
  agents: Partial<GcpAgentConfiguration>[];
};

export type TopLevelConfig = {
  gcp: GcpTopLevelConfig;
};

export type AgentConfiguration = {
  gcp: {
    project: string;
    agents: GcpAgentConfiguration[];
  };
};

export class GcpAgentConfiguration {
  // can name/queue be merged?
  name: string;
  queue: string;

  project: string;
  zone: string;
  // imageFamily?: string; // ?
  image: string;
  machineType: string;

  serviceAccount?: string;

  diskType?: 'pd-ssd' | 'pd-balanced' | 'pd-standard';
  diskSizeGb?: number;
  startupScript?: string;
  tags?: string[];
  metadata?: Record<string, string>;

  overprovision?: number;
  minimumAgents?: number;
  maximumAgents?: number;
  idleTimeoutSecs?: number;
  exitAfterOneJob?: boolean;
  gracefulStopAfterSecs?: number;
  hardStopAfterSecs?: number;

  constructor(config: Partial<GcpAgentConfiguration>) {
    const requiredFields = ['name', 'queue', 'project', 'zone', 'image', 'machineType'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw Error(`GCP agent config missing '${field}' field`);
      }
    }

    Object.assign(this, config);
  }

  // Should return a hash that only changes if a configuration changes that would require launching a new agent
  // We can use this to tag agents with the version of the config that was used to launch them, and drain them if it changes
  hash() {
    const hashFields = [
      'project',
      'zone',
      'image',
      'machineType',
      'serviceAccount',
      'diskType',
      'diskSizeGb',
      'startupScript',
      'tags',
      'metadata',
      'idleTimeoutSecs',
      'exitAfterOneJob',
    ];

    const fields = {};
    for (const field of hashFields) {
      fields[field] = this[field];
    }
    const str = JSON.stringify(fields);
    const hash = crypto.createHash('sha256');
    return hash.update(str).digest('hex');
  }
}

const config: TopLevelConfig = {
  gcp: {
    project: 'elastic-kibana-184716',
    zone: 'us-central1-b',
    // serviceAccount: '',
    agents: [
      {
        queue: 'default',
        name: 'kibana-buildkite',
        overprovision: 0, // percentage or flat number
        minimumAgents: 0,
        maximumAgents: 500,
        gracefulStopAfterSecs: 60 * 60 * 6,
        hardStopAfterSecs: 60 * 60 * 9,
        idleTimeoutSecs: 600, // stopAfterIdleSecs?
        exitAfterOneJob: false,
        image: 'bk-agent-1614806165',
        machineType: 'e2-small', // e2-small/micro
        // machineType: 'n2-standard-4',
        diskType: 'pd-ssd',
        diskSizeGb: 75,
        startupScript: '',
        tags: [],
        metadata: {},
      },
      {
        queue: 'ci-group',
        name: 'kibana-buildkite-cigroup', // TODO max length?
        overprovision: 0,
        minimumAgents: 0,
        maximumAgents: 100,
        gracefulStopAfterSecs: 60 * 60 * 6,
        hardStopAfterSecs: 60 * 60 * 9,
        idleTimeoutSecs: 600,
        exitAfterOneJob: false,
        image: 'bk-agent-1614806165',
        machineType: 'n2-standard-8',
        diskType: 'pd-ssd',
        diskSizeGb: 256,
        startupScript: '',
        tags: [],
        metadata: {},
      },
    ],
  },
};

export function getAgentConfigsFromTopLevelConfig(config: TopLevelConfig) {
  const allConfigs = { gcp: [] } as { gcp: GcpAgentConfiguration[] };
  const defaultGcpConfigs = { ...config.gcp };
  delete defaultGcpConfigs.agents;

  for (const agent of config.gcp.agents) {
    try {
      const agentConfig = new GcpAgentConfiguration({
        ...defaultGcpConfigs,
        ...agent,
      });
      allConfigs.gcp.push(agentConfig);
    } catch (ex) {
      logger.error(ex);
    }
  }

  return allConfigs;
}

export function getGcpAgentConfigsFromTopLevelConfig(config: TopLevelConfig) {
  const allConfigs: GcpAgentConfiguration[] = [];
  const defaultGcpConfigs = { ...config.gcp };
  delete defaultGcpConfigs.agents;

  for (const agent of config.gcp.agents) {
    try {
      const agentConfig = new GcpAgentConfiguration({
        ...defaultGcpConfigs,
        ...agent,
      });
      allConfigs.push(agentConfig);
    } catch (ex) {
      logger.error(ex);
    }
  }

  return allConfigs;
}

export async function getConfig() {
  return {
    gcp: {
      ...config.gcp,
      agents: getGcpAgentConfigsFromTopLevelConfig(config),
    },
  } as AgentConfiguration;
}

export async function getAgentConfigs() {
  const conf = await getConfig();
  return getAgentConfigsFromTopLevelConfig(conf);
}

// merge the default configs
// how to efficiently query for the instance count without IG group? Or just create ig groups dynamically?
// how do we drain old agents on config updates?
// use API to stop old agents
//   use a hash of relevant configs that could affect instances and stop old ones that don't match the hash?
