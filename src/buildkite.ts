import axios, { AxiosInstance } from 'axios';
import logger from './lib/logger';
import parseLinkHeader from './lib/parseLinkHeader';

export interface AgentMetrics {
  agents: { idle: number; busy: number; total: number };
  jobs: { scheduled: number; running: number; waiting: number; total: number };
  organization: { slug: string };
}

export interface Agent {
  id: string;
  url: string;
  web_url: string;
  name: string;
  connection_state: string;
  ip_address: string;
  hostname: string;
  user_agent: string;
  version: string;
  creator: string;
  created_at: string;
  job?: {
    [key: string]: any;
    // TODO create a separate interface and fill in if we ever need job
  };
  last_job_finished_at: string;
  priority: number;
  meta_data: string[];
}

export class Buildkite {
  http: AxiosInstance;
  agentHttp: AxiosInstance;

  constructor() {
    const BUILDKITE_BASE_URL = process.env.BUILDKITE_BASE_URL || 'https://api.buildkite.com';
    const BUILDKITE_TOKEN = process.env.BUILDKITE_TOKEN;

    const BUILDKITE_AGENT_BASE_URL = process.env.BUILDKITE_AGENT_BASE_URL || 'https://agent.buildkite.com/v3';
    const BUILDKITE_AGENT_TOKEN = process.env.BUILDKITE_AGENT_TOKEN;

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

  getAgents = async (): Promise<Agent[]> => {
    logger.debug('[buildkite] Getting all agents');

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

    logger.debug('[buildkite] Finished getting all agents');

    return agents.flat();
  };

  getAgentMetrics = async (queue: string) => {
    return (await this.agentHttp.get(`metrics/queue?name=${encodeURIComponent(queue)}`)).data as AgentMetrics;
  };

  stopAgent = async (agent: Agent) => {
    return await this.http.put(`v2/organizations/elastic/agents/${agent.id}/stop`, { force: false });
  };
}
