import { DockerComposeEnvironment, Wait } from 'testcontainers';
import { createLogger } from './logger-utils.js';
import { run } from './cli.js';
import path from 'node:path';
import { currentDir, QaRemoteConfig } from './config';

const config = new QaRemoteConfig();
config.setNetworkId();
const dockerEnv = new DockerComposeEnvironment(path.resolve(currentDir, '..'), 'proof-server.yml').withWaitStrategy(
  'proof-server',
  Wait.forLogMessage('Actix runtime found; starting in Actix runtime', 1),
);
const logger = await createLogger(config.logDir);
await run(config, logger, dockerEnv);
