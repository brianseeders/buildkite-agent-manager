import winston from 'winston';
import ecsFormat from '@elastic/ecs-winston-format';

const logger = winston.createLogger({
  format: process.env.NODE_ENV === 'production' ? ecsFormat() : winston.format.simple(),
  transports: [new winston.transports.Console()],
});

export default logger;
