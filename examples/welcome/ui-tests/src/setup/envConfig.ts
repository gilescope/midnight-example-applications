export interface Config {
  readonly organizerUrl: string;
  readonly participantUrl: string;
  readonly contractAddress: string;
  readonly publicKey: string;
  readonly nodeAddress: string;
  readonly indexerAddress: string;
  readonly proofServerAddress: string;
  readonly addedParticipant: string;
}

export class DevnetConfig implements Config {
  organizerUrl = 'https://devnet.dhako303gy77j.amplifyapp.com';
  participantUrl = 'https://devnet.d2ppp94ink86u8.amplifyapp.com';

  contractAddress = '010001b34c461b6c266fa34c67de336cc3816cd5fd0b261ada28abf68197ba3e6e7535';
  publicKey = '094145f5dd4e1f7e87098fbfcdf005a2339cb9324e4c01730a133fd073ad733e';

  nodeAddress = 'https://rpc.devnet.midnight.network';
  indexerAddress = 'https://indexer.devnet.midnight.network/api/v1/graphql';
  proofServerAddress = 'http://localhost:6300';

  addedParticipant = 'devnetParticipant';
}

export class AriadneQaConfig implements Config {
  organizerUrl = 'https://ariadneqa.d1v3bwiuokhnu0.amplifyapp.com';
  participantUrl = 'https://ariadneqa.dfcyvzl62v1ma.amplifyapp.com';

  contractAddress = '01000129182a2f73c1cf214606b69012f9bcca1a910873ac65e6d40247358e7d32b750';
  publicKey = 'fdd119fb6ca4042702149a116762fc24157bca66d99c58bd4c924fd8bb204d69';

  nodeAddress = 'https://rpc.ariadne-qa.dev.midnight.network';
  indexerAddress = 'https://indexer.ariadne-qa.dev.midnight.network/api/v1/graphql';
  proofServerAddress = 'http://localhost:6300';

  addedParticipant = 'ariadneQaParticipant';
}

export function getConfig(): Config {
  let config: Config;
  let env = '';
  if (process.env.TEST_ENV !== undefined) {
    env = process.env.TEST_ENV;
  } else {
    throw new Error('TEST_ENV environment variable is not defined.');
  }
  switch (env) {
    case 'devnet':
      config = new DevnetConfig();
      break;
    case 'ariadne-qa':
      config = new AriadneQaConfig();
      break;
    default:
      throw new Error(`Unknown env value=${env}`);
  }
  return config;
}
