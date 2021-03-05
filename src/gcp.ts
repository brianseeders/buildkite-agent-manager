import crypto from 'crypto';
import Compute from '@google-cloud/compute';
import { google } from 'googleapis';
import { GcpAgentConfiguration, GcpTopLevelConfig } from './agentConfig';

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

export function createVmConfiguration(agentConfig: GcpAgentConfiguration) {
  const config = {
    disks: [
      {
        type: 'PERSISTENT',
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: `projects/${agentConfig.project}/global/images/${agentConfig.image}`,
          diskType: `projects/${agentConfig.project}/zones/${agentConfig.zone}/diskTypes/${agentConfig.diskType || 'pd-ssd'}`,
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
  };

  return config;
}

export async function createInstance(agentConfig: GcpAgentConfiguration) {
  const zone = compute.zone(agentConfig.zone);
  const vm = zone.vm(`${agentConfig.name}-${crypto.randomBytes(INSTANCE_SUFFIX_BYTES).toString('hex')}`);
  const config = createVmConfiguration(agentConfig);

  const result = await vm.create(config);
  return result;
}

export async function getAllAgentInstances(gcpConfig: GcpTopLevelConfig) {
  const vms = await compute.getVMs({ filter: `labels.buildkite-agent=true`, maxResults: 500 });

  return vms[0] as GcpInstance[];
}

export async function deleteInstance(instance: GcpInstance) {
  const zone = compute.zone(instance.metadata.zone.split('/').pop());
  const vm = zone.vm(instance.metadata.name);
  return vm.delete();
}

export async function getImageForFamily(projectId: string, family: string) {
  const result = await computeAlt.images.getFromFamily({
    family: family,
    project: projectId,
  });

  return result.data as GcpImage;
}
