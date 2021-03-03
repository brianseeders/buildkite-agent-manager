import got, { Got } from 'got';

const BUILDKITE_BASE_URL = process.env.BUILDKITE_BASE_URL || 'https://api.buildkite.com';
const BUILDKITE_TOKEN = process.env.BUILDKITE_TOKEN;

const BUILDKITE_AGENT_BASE_URL = process.env.BUILDKITE_AGENT_BASE_URL || 'https://agent.buildkite.com/v3';
const BUILDKITE_AGENT_TOKEN = process.env.BUILDKITE_AGENT_TOKEN;

export interface AgentMetrics {
  agents: { idle: number; busy: number; total: number };
  jobs: { scheduled: number; running: number; waiting: number; total: number };
  organization: { slug: string };
}

export class Buildkite {
  http: Got;
  agentHttp: Got;

  constructor() {
    this.http = got.extend({
      prefixUrl: BUILDKITE_BASE_URL,
      headers: {
        Authorization: `Bearer ${BUILDKITE_TOKEN}`,
      },
    });

    this.agentHttp = got.extend({
      prefixUrl: BUILDKITE_AGENT_BASE_URL,
      headers: {
        Authorization: `Token ${BUILDKITE_AGENT_TOKEN}`,
      },
    });
  }

  getAgents = async () => {
    // TODO implement pagination, got() doesn't handle blank link header that buildkite uses at the end
    const resp = await this.http('v2/organizations/elastic/agents?per_page=100').json();
    return resp;
  };

  getAgentMetrics = async (queue: string) => {
    return (await this.agentHttp.get(`metrics/queue?name=${encodeURIComponent(queue)}`).json()) as AgentMetrics;
  };
}
