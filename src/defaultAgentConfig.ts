import { TopLevelConfig } from './agentConfig';

const defaultConfig: TopLevelConfig = {
  gcp: {
    project: 'elastic-kibana-184716',
    // zone: 'us-central1-b',
    zone: 'us-west1-a',
    serviceAccount: 'elastic-buildkite-agent@elastic-kibana-184716.iam.gserviceaccount.com',
    agents: [
      {
        queue: 'default',
        name: 'kibana-buildkite',
        overprovision: 0, // percentage or flat number
        minimumAgents: 0,
        maximumAgents: 500,
        gracefulStopAfterSecs: 60 * 60 * 6,
        hardStopAfterSecs: 60 * 60 * 9,
        idleTimeoutSecs: 60 * 15, // stopAfterIdleSecs?
        exitAfterOneJob: false,
        imageFamily: 'kibana-bk-dev-agents',
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
        name: 'kibana-buildkite-cigroup',
        overprovision: 0,
        minimumAgents: 0,
        maximumAgents: 100,
        gracefulStopAfterSecs: 60 * 60 * 6,
        hardStopAfterSecs: 60 * 60 * 9,
        idleTimeoutSecs: 600,
        exitAfterOneJob: false,
        imageFamily: 'kibana-bk-dev-agents',
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

export default defaultConfig;
