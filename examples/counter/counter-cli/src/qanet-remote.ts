import { createLogger } from './logger-utils.js';
import { run } from './cli.js';
import { QaRemoteConfig } from './config';

const config = new QaRemoteConfig();
config.setNetworkId();
const logger = await createLogger(config.logDir);
await run(config, logger);
