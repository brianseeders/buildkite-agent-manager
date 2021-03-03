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
    status: 'TERMINATED' | 'ASDF'; // TODO
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

export async function createInstance(agentConfig: GcpAgentConfiguration, ig: InstanceGroup = null) {
  // ig = ig || (await getOrCreateInstanceGroup(agentConfig));

  const zone = compute.zone(agentConfig.zone);
  const vm = zone.vm(`${agentConfig.name}-${new Date().getTime()}`);
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
          key: 'buildkite-agent-hash',
          value: agentConfig.hash(),
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

async function ensureSize(desiredSize) {
  const [ig] = await instanceGroupManager.getMetadata();
  const currentSize = ig.targetSize;

  if (currentSize != desiredSize) {
    console.log(ig);
    console.log(`Scaling ${INSTANCE_GROUP} from ${currentSize} to ${desiredSize}`);

    await instanceGroupManager.resize(desiredSize);
  }
}
