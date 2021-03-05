import { getAgentConfigs, getAgentConfigsFromTopLevelConfig } from './agentConfig';

describe.skip('agentConfig', () => {
  test('should', async () => {
    const configs = await getAgentConfigs();
    expect(configs).toMatchInlineSnapshot(`
      Object {
        "gcp": Array [
          GcpAgentConfiguration {
            "diskSizeGb": 76,
            "diskType": "pd-ssd",
            "exitAfterOneJob": false,
            "gracefulStopAfterSecs": 21600,
            "hardStopAfterSecs": 32400,
            "idleTimeoutSecs": 3600,
            "imageFamily": "kibana-bk-dev-agents",
            "machineType": "e2-small",
            "maximumAgents": 500,
            "metadata": Object {},
            "minimumAgents": 0,
            "name": "kibana-buildkite",
            "overprovision": 0,
            "project": "elastic-kibana-184716",
            "queue": "default",
            "startupScript": "",
            "tags": Array [],
            "zone": "us-central1-b",
          },
          GcpAgentConfiguration {
            "diskSizeGb": 256,
            "diskType": "pd-ssd",
            "exitAfterOneJob": false,
            "gracefulStopAfterSecs": 21600,
            "hardStopAfterSecs": 32400,
            "idleTimeoutSecs": 600,
            "imageFamily": "kibana-bk-dev-agents",
            "machineType": "n2-standard-8",
            "maximumAgents": 100,
            "metadata": Object {},
            "minimumAgents": 0,
            "name": "kibana-buildkite-cigroup",
            "overprovision": 0,
            "project": "elastic-kibana-184716",
            "queue": "ci-group",
            "startupScript": "",
            "tags": Array [],
            "zone": "us-central1-b",
          },
        ],
      }
    `);
  });

  test('should exclude invalid/incomplete configs', async () => {
    const configs = getAgentConfigsFromTopLevelConfig({ gcp: { project: 'project', agents: [{ minimumAgents: 1 }] } });
    expect(configs.gcp.length).toBe(0);
  });

  test('should', async () => {
    const configs = await getAgentConfigs();
    expect(configs.gcp[0].hash()).toEqual('fc364a61cf709a3c976a64e4b31db37370dd5f249eaaaa6e480ca464df317b44');
  });
});
