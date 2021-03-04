import { google } from 'googleapis';
import Compute from '@google-cloud/compute';
import { GcpAgentConfiguration, GcpTopLevelConfig } from './agentConfig';

const compute = new Compute();

const ZONE = 'us-central1-a';
const INSTANCE_GROUP = 'kibana-buildkite';

const zone = compute.zone(ZONE);
const instanceGroup = zone.instanceGroup(INSTANCE_GROUP);
const instanceGroupManager = zone.instanceGroupManager(INSTANCE_GROUP);

export type InstanceGroup = {
  metadata: {
    id: string;
    name: string;
    size: number;
  };
};

export type GcpInstance = {
  metadata: {
    id: string;
    creationTimestamp: string;
    name: string;
    // tags?: { // network tags
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

export async function getOrCreateInstanceGroup(config: GcpAgentConfiguration) {
  const zone = compute.zone(config.zone);
  const instanceGroup = zone.instanceGroup(config.name);
  const ig = await instanceGroup.get({
    autoCreate: true,
  });

  return ig[0] as InstanceGroup;
}

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

export async function createInstance(agentConfig: GcpAgentConfiguration, ig: InstanceGroup = null) {
  // ig = ig || (await getOrCreateInstanceGroup(agentConfig));

  const zone = compute.zone(agentConfig.zone);
  const vm = zone.vm(`${agentConfig.name}-${new Date().getTime()}`); // TODO UUID or similar?
  const config = {
    disks: [
      {
        type: 'PERSISTENT',
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: `projects/${agentConfig.project}/global/images/${agentConfig.image}`,
          diskType: `projects/${agentConfig.project}/zones/${agentConfig.zone}/diskTypes/${agentConfig.diskType || 'pd-ssd'}`,
          diskSizeGb: agentConfig.diskSizeGb || '100', // replace default with default from source image?
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
          key: 'bk',
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

  const result = await vm.create(config);

  // const instanceGroup = zone.instanceGroup(agentConfig.name);
  // await instanceGroup.add(vm);

  return result;
}

export async function getAllAgentInstances(gcpConfig: GcpTopLevelConfig) {
  const vms = await compute.getVMs({ filter: `labels.buildkite-agent=true` });

  return vms[0] as GcpInstance[];
}

export async function deleteInstance(instance: GcpInstance) {
  const zone = compute.zone(instance.metadata.zone.split('/').pop());
  const vm = zone.vm(instance.metadata.name);
  return vm.delete();
}
