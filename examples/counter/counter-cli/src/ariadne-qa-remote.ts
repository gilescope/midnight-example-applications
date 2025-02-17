import { createLogger } from './logger-utils.js';
import { run } from './cli.js';
import { AriadneQaRemoteConfig } from './config.js';

const config = new AriadneQaRemoteConfig();
const logger = await createLogger(config.logDir);
await run(config, logger);
