import crypto from 'crypto';
import defaultAgentConfig from './defaultAgentConfig';

import { INSTANCE_SUFFIX_BYTES } from './gcp';
import logger from './lib/logger';

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
  imageFamily?: string;
  image?: string;
  machineType: string;

  serviceAccount?: string;
  serviceAccounts?: string[];

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
    const requiredFields = ['name', 'queue', 'project', 'zone', 'imageFamily', 'machineType'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw Error(`GCP agent config missing '${field}' field`);
      }
    }

    if (!config.image && !config.imageFamily) {
      throw Error(`GCP agent config must include 'image' or 'imageFamily'`);
    }

    // 63 is max length for GCP instance names, minus a unique suffix length, minus 1 character for a hyphen
    const maxLength = 63 - INSTANCE_SUFFIX_BYTES * 2 - 1;
    if (config.name.length > maxLength) {
      throw Error(`GCP agent name must be fewer than ${maxLength} characters.`);
    }

    if (config.serviceAccount && !config.serviceAccounts) {
      config.serviceAccounts = [config.serviceAccount];
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
      'imageFamily',
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
      ...defaultAgentConfig.gcp,
      agents: getGcpAgentConfigsFromTopLevelConfig(defaultAgentConfig),
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
