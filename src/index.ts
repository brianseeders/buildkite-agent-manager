require('dotenv').config();

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

    const doRun = async () => {
      logger.info(`Starting run`);
      try {
        await run();
      } catch (ex) {
        console.error(ex);
      } finally {
        logger.info(`Finished run`);
      }

      await sleep(TIME_BETWEEN_RUNS);
      doRun();
    };

    doRun();
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
