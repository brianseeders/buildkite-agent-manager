require('dotenv').config();

import express from 'express';

import bootstrapSecrets from './bootstrapGcpSecrets';

import logger from './lib/logger';

import * as gcp from './gcp';

import { getConfig, getAgentConfigs } from './agentConfig';
import { Buildkite } from './buildkite';
import { run } from './manager';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  if (process.env.BOOTSTRAP_GCP_SECRETS) {
    await bootstrapSecrets();
  }

  if (process.env.DRY_RUN) {
  }

  const doRun = async () => {
    try {
      await run();
    } catch (ex) {
      console.error(ex);
    }

    await sleep(30000);
    doRun();
  };

  doRun();
  logger.info('App started');

  return;

  const buildkite = new Buildkite();
  const agents = await buildkite.getAgents();
  console.log(agents);
  return;

  // change to return { gcp: { agents: [], }}?
  const config = await getConfig();
  const configs = await getAgentConfigs();

  // const r = await gcp.getAllAgentInstances(config.gcp);
  // console.log(JSON.stringify(r, null, 2));
  // return;

  // const ig = await gcp.getOrCreateInstanceGroup(configs.gcp[0]);
  // console.log(ig.metadata.size);
  // return;
  const c = await gcp.createInstance(configs.gcp[0]);

  console.log(c);

  return;

  const app = express();
  app.get('/live', (req, res) => {
    res.send('i am alive');
  });

  app.listen(process.env.PORT || 3000, () => logger.info('Server started on port 3000'));

  logger.info('App started');
})();
