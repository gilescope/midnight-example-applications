import { createLogger } from './logger-utils.js';
import { run } from './cli.js';
import { DevnetLocalConfig } from './config';

const config = new DevnetLocalConfig();
const logger = await createLogger(config.logDir);
await run(config, logger);
