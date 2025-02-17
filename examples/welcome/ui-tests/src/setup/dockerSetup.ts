/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-expressions */
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment, Wait } from 'testcontainers';

export async function runProofServer() {
  const uid = Math.floor(Math.random() * 1000).toString();
  const composeEnvironment: StartedDockerComposeEnvironment = await new DockerComposeEnvironment('./', 'proof-server.yml')
    .withWaitStrategy(`proof-server_${uid}`, Wait.forLogMessage('Actix runtime found; starting in Actix runtime'))
    .up();
  120_000;
  return composeEnvironment;
}
