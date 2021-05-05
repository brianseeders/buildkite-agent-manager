import crypto from 'crypto';
import Compute from '@google-cloud/compute';
import { google } from 'googleapis';
import { GcpAgentConfiguration, GcpTopLevelConfig } from './agentConfig';
import logger from './lib/logger';

const compute = new Compute();
// ImageFamily fetching isn't included in @google-cloud/compute
const computeAlt = google.compute('v1');

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/compute'],
});

google.options({
  auth: auth,
});

// the string length of the suffix will be 2*INSTANCE_SUFFIX_BYTES
export const INSTANCE_SUFFIX_BYTES = 8;

export type GcpInstance = {
  metadata: {
    id: string;
    creationTimestamp: string;
    name: string;
    // tags?: { // these are network tags
    //   items?: string[]
    // },
    machineType: string;
    status: 'TERMINATED' | 'STOPPING' | 'PROVISIONING' | 'STAGING' | 'RUNNING' | 'REPAIRING' | 'SUSPENDING' | 'SUSPENDED';
    zone: string;
    metadata: {
      items: { key: string; value: string }[];
    };
    labels?: Record<string, string>;
  };
};

export type GcpImage = {
  id: string;
  creationTimestamp: string;
  name: string;
  description: string;
  family: string;
  selfLink: string;
  sourceType: string;
  status: string;
  archiveSizeBytes: string;
  diskSizeGb: string;
};

export function getBuildkiteConfig(agentConfig: GcpAgentConfiguration) {
  const bkConfig: Record<string, string | number | boolean> = {
    tags: `queue=${agentConfig.queue},hash=${agentConfig.hash()}`,
    name: '%hostname',
    'build-path': '/var/lib/buildkite-agent/builds',
  };

  if (agentConfig.idleTimeoutMins) {
    bkConfig['disconnect-after-idle-timeout'] = agentConfig.idleTimeoutMins * 60;
  }

  if (agentConfig.idleTimeoutSecs) {
    bkConfig['disconnect-after-idle-timeout'] = agentConfig.idleTimeoutSecs;
  }

  if (agentConfig.exitAfterOneJob) {
    bkConfig['disconnect-after-job'] = true;
  }

  return Object.keys(bkConfig)
    .map((key) => `${key}="${bkConfig[key].toString()}"`)
    .join('\n');
}

export function createVmConfiguration(zone: string, agentConfig: GcpAgentConfiguration) {
  const config = {
    disks: [
      {
        type: 'PERSISTENT',
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: `projects/${agentConfig.project}/global/images/${agentConfig.image}`,
          diskType: `projects/${agentConfig.project}/zones/${zone}/diskTypes/${agentConfig.diskType || 'pd-ssd'}`,
          diskSizeGb: agentConfig.diskSizeGb || '100', // TODO replace default with default from source image? need to pull image metadata first if so
        },
      },
    ],
    networkInterfaces: [
      {
        accessConfigs: [
          {
            type: 'ONE_TO_ONE_NAT',
            networkTier: 'PREMIUM',
          },
        ],
      },
    ],
    machineType: agentConfig.machineType,
    tags: ['buildkite-agent'],
    labels: {
      'buildkite-agent': 'true',
      'buildkite-agent-name': agentConfig.name,
    },
    metadata: {
      items: [
        {
          key: 'buildkite-agent',
          value: 'true',
        },
        {
          key: 'buildkite-agent-name',
          value: agentConfig.name,
        },
        {
          key: 'buildkite-agent-queue',
          value: agentConfig.queue,
        },
        {
          key: 'buildkite-agent-hash',
          value: agentConfig.hash(),
        },
        {
          key: 'buildkite-agent-config',
          value: getBuildkiteConfig(agentConfig),
        },
        {
          key: 'startup-script',
          value: '/opt/bk-startup.sh',
        },
      ],
    },
    scheduling: {
      automaticRestart: false,
    },
  } as any;

  if (agentConfig.serviceAccounts?.length) {
    config.serviceAccounts = agentConfig.serviceAccounts.map((serviceAccount) => ({
      email: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    }));
  }

  if (agentConfig.localSsds && agentConfig.localSsds > 0) {
    for (let i = 0; i < agentConfig.localSsds; i++) {
      config.disks.push({
        type: 'SCRATCH',
        initializeParams: {
          diskType: `zones/${zone}/diskTypes/local-ssd`,
        },
        autoDelete: true,
        interface: 'NVME',
      });
    }
  }

  return config;
}

export async function createInstance(agentConfig: GcpAgentConfiguration) {
  const zone = agentConfig.getNextZone();
  const vm = compute.zone(zone).vm(`${agentConfig.name}-${crypto.randomBytes(INSTANCE_SUFFIX_BYTES).toString('hex')}`);
  const config = createVmConfiguration(zone, agentConfig);

  if (!process.env.DRY_RUN) {
    const result = await vm.create(config);
    return result;
  } else {
    logger.info('[gcp] Would create ', config);
  }
}

export async function getAllAgentInstances(gcpConfig: GcpTopLevelConfig) {
  logger.debug('[gcp] Getting all instances');
  const vms = await compute.getVMs({ filter: `labels.buildkite-agent=true` });
  logger.debug('[gcp] Finished getting all instances');

  return vms[0] as GcpInstance[];
}

export async function deleteInstance(instance: GcpInstance) {
  if (!process.env.DRY_RUN) {
    const zone = compute.zone(instance.metadata.zone.split('/').pop());
    const vm = zone.vm(instance.metadata.name);
    return vm.delete();
  } else {
    logger.info('[gcp] Would delete ', instance.metadata.name);
  }
}

export async function getImageForFamily(projectId: string, family: string) {
  const result = await computeAlt.images.getFromFamily({
    family: family,
    project: projectId,
  });

  return result.data as GcpImage;
}
