require('dotenv').config();

import express from 'express';
import bootstrapSecrets from './bootstrapGcpSecrets';
import logger from './lib/logger';
import { run } from './manager';

const TIME_BETWEEN_RUNS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  if (process.env.BOOTSTRAP_GCP_SECRETS) {
    logger.info('Bootstraping secrets from GCP');
    await bootstrapSecrets();
  }

  if (process.env.DRY_RUN) {
  }

  if (process.env.CONTINUOUS_MODE === 'true') {
    logger.info(`Running in continuous mode, time between runs is ${TIME_BETWEEN_RUNS}ms`);

    let lastRunStarted: Date = new Date();

    const doRun = async () => {
      logger.info(`Starting run`);
      lastRunStarted = new Date();

      try {
        await run();
      } catch (ex) {
        logger.error('[app] Error executing run', ex);
      } finally {
        logger.info(`Finished run`);
      }

      await sleep(TIME_BETWEEN_RUNS);
      doRun();
    };

    doRun();

    logger.info(`Running in continuous mode, starting health check services`);

    const app = express();
    const port = process.env.PORT || 3000;

    app.get('/', (req, res) => {
      res.send('up');
    });

    app.get('/live', (req, res) => {
      // Assume everything is working properly, unless a new run hasn't been started in the last 10 minutes
      if (new Date().getTime() - lastRunStarted.getTime() < 10 * 60 * 1000) {
        res.send({
          status: 'up',
          lastRunStarted: lastRunStarted.toISOString(),
        });
      } else {
        res.statusCode = 500;
        res.send({
          status: 'down',
          lastRunStarted: lastRunStarted.toISOString(),
        });
      }
    });

    app.listen(port, () => {
      console.log(`App started, listening on ${port}`);
    });
  } else {
    try {
      await run();
      process.exit(0);
    } catch (ex) {
      console.error(ex);
      process.exit(1);
    }
  }
})();
