import axios, { AxiosInstance } from 'axios';
import parseLinkHeader from './lib/parseLinkHeader';

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
  http: AxiosInstance;
  agentHttp: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: BUILDKITE_BASE_URL,
      headers: {
        Authorization: `Bearer ${BUILDKITE_TOKEN}`,
      },
    });

    this.agentHttp = axios.create({
      baseURL: BUILDKITE_AGENT_BASE_URL,
      headers: {
        Authorization: `Token ${BUILDKITE_AGENT_TOKEN}`,
      },
    });
  }

  getAgents = async () => {
    let link = 'v2/organizations/elastic/agents?per_page=100';
    const agents = [];

    // Don't get stuck in an infinite loop or follow more than 50 pages
    for (let i = 0; i < 50; i++) {
      if (!link) {
        break;
      }

      const resp = await this.http.get(link);
      link = null;

      agents.push(await resp.data);

      if (resp.headers.link) {
        const result = parseLinkHeader(resp.headers.link as string);
        if (result?.next) {
          link = result.next;
        }
      }
    }

    return agents.flat();
  };

  getAgentMetrics = async (queue: string) => {
    return (await this.agentHttp.get(`metrics/queue?name=${encodeURIComponent(queue)}`)).data as AgentMetrics;
  };
}
