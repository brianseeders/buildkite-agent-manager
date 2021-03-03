import { getAgentConfigs, getAgentConfigsFromTopLevelConfig } from './agentConfig';

describe('agentConfig', () => {
  test('should', async () => {
    const configs = await getAgentConfigs();
    expect(configs).toMatchInlineSnapshot(`
      Object {
        "gcp": Array [
          GcpAgentConfiguration {
            "diskSizeGb": 256,
            "diskType": "pd-ssd",
            "exitAfterOneJob": false,
            "idleTimeoutSecs": 600,
            "image": "bk-agent-1614194879",
            "machineType": "n2-standard-8",
            "metadata": Object {},
            "minimumAgents": 5,
            "name": "kibana-buildkite",
            "overprovision": 0,
            "project": "elastic-kibana-184716",
            "queue": "default",
            "serviceAccount": "",
            "startupScript": "",
            "tags": Array [],
            "zone": "us-central1-b",
          },
        ],
      }
    `);
  });

  test('should exclude invalid/incomplete configs', async () => {
    const configs = getAgentConfigsFromTopLevelConfig({ gcp: { agents: [{ minimumAgents: 1 }] } });
    expect(configs.gcp.length).toBe(0);
  });

  test('should', async () => {
    const configs = await getAgentConfigs();
    expect(configs.gcp[0].hash()).toEqual('633e533db8e3c4a27210283be60864ef35e00e85b270e24ca0ee4ed964a05b5f');
  });
});
