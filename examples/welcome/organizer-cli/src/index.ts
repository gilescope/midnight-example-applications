import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { WebSocket } from 'ws';
import { webcrypto } from 'crypto';
import {
  createParticipantsMaybeVector,
  createWelcomeContract,
  type DeployedWelcomeContract,
  fromHex,
  type PrivateStates,
  toHex,
  type WelcomeCircuitKeys,
} from '@midnight-ntwrk/welcome-midnight-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  createOrganizerWelcomePrivateState,
  ledger,
  pureCircuits,
  type Ledger,
  type WelcomePrivateState,
} from '@midnight-ntwrk/welcome-contract';
import {
  createBalancedTx,
  type BalancedTransaction,
  type MidnightProvider,
  type MidnightProviders,
  type UnbalancedTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import * as Rx from 'rxjs';
import { type CoinInfo, nativeToken, Transaction, type TransactionId } from '@midnight-ntwrk/ledger';
import { Transaction as ZswapTransaction } from '@midnight-ntwrk/zswap';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { type Resource, WalletBuilder } from '@midnight-ntwrk/wallet';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { type Logger } from 'pino';
import { type Config } from './config.js';
import { randomSk, randomWalletSeed } from './crypto-utils.js';
import { type DockerComposeEnvironment } from 'testcontainers';

// @ts-expect-error: It's needed to make Scala.js and WASM code able to use cryptography
globalThis.crypto = webcrypto;

// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

// Overrides the type defined in 'welcome-midnight-js', since we don't need the full generality here.
type WelcomeProviders = MidnightProviders<WelcomeCircuitKeys, PrivateStates>;

export const getWelcomePrivateState = (providers: WelcomeProviders): Promise<WelcomePrivateState | null> =>
  providers.privateStateProvider.get('welcomePrivateState');

export const getWelcomeLedgerState = (
  providers: WelcomeProviders,
  contractAddress: ContractAddress,
): Promise<Ledger | null> =>
  providers.publicDataProvider
    .queryContractState(contractAddress)
    .then((contractState) => (contractState !== null ? ledger(contractState.data) : null));

const join = async (providers: WelcomeProviders, rli: Interface, logger: Logger): Promise<DeployedWelcomeContract> => {
  const contractAddress = await rli.question('What is the contract address (in hex)? ');
  let welcomeContract;
  try {
    const existingPrivateState = await getWelcomePrivateState(providers);
    welcomeContract = await findDeployedContract(
      providers,
      contractAddress,
      createWelcomeContract(providers.walletProvider),
      {
        privateStateKey: 'welcomePrivateState',
        initialPrivateState: existingPrivateState ?? createOrganizerWelcomePrivateState(randomSk()),
      },
    );
    logger.info(`Joined contract at address: ${welcomeContract.finalizedDeployTxData.contractAddress}`);
  } catch (e) {
    if (e instanceof Error) {
      logger.error(`Found error: ${e.message}`);
    } else {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      logger.error(`Found unexpected error: '${e}'`);
    }

    logger.info('Failed to join the Contract, please try again.');
    return await join(providers, rli, logger); // Recursively retry until a valid welcomeContract is obtained
  }

  return welcomeContract;
};

const deploy = async (
  providers: WelcomeProviders,
  initialParticipants: string[],
  logger: Logger,
): Promise<DeployedWelcomeContract> => {
  logger.info(`Deploying welcome contract...`);
  const welcomeContract = await deployContract(
    providers,
    'welcomePrivateState',
    createOrganizerWelcomePrivateState(randomSk()),
    createWelcomeContract(providers.walletProvider),
    createParticipantsMaybeVector(initialParticipants),
  );
  logger.info(`Deployed contract at address: ${welcomeContract.finalizedDeployTxData.contractAddress}`);
  return welcomeContract;
};

const DEPLOY_OR_JOIN_QUESTION = `
Choose one of the following:
  1. Deploy a new welcome contract
  2. Join an existing welcome contract
`;

const deployOrJoin = async (
  providers: WelcomeProviders,
  initialParticipants: string[],
  rli: Interface,
  logger: Logger,
): Promise<DeployedWelcomeContract> => {
  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
    switch (choice) {
      case '1':
        return await deploy(providers, initialParticipants, logger);
      case '2':
        return await join(providers, rli, logger);
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

const ADD_PARTICIPANT_QUESTION = `Enter the new participant's GitHub username: `;

const addParticipant = async (
  welcomeContract: DeployedWelcomeContract,
  rli: Interface,
  logger: Logger,
): Promise<void> => {
  const participantId = await rli.question(ADD_PARTICIPANT_QUESTION);
  logger.info(`Adding participant...`);
  const finalizedTxData = await welcomeContract.contractCircuitsInterface
    .add_participant(participantId)
    .then((u) => u.submit());
  logger.info(`Participant '${participantId}' added in transaction ${finalizedTxData.txHash}`);
};

const ADD_ORGANIZER_QUESTION = `Enter the new organizer's public key (in hex): `;

const addOrganizer = async (
  welcomeContract: DeployedWelcomeContract,
  rli: Interface,
  logger: Logger,
): Promise<void> => {
  const pk = await rli.question(ADD_ORGANIZER_QUESTION);
  logger.info(`Adding organizer...`);
  const finalizedTxData = await welcomeContract.contractCircuitsInterface
    .add_organizer(fromHex(pk))
    .then((u) => u.submit());
  logger.info(`Organizer '${pk}' added in transaction ${finalizedTxData.txHash}`);
};

const displayLedgerState = async (
  providers: WelcomeProviders,
  welcomeContract: DeployedWelcomeContract,
  logger: Logger,
): Promise<void> => {
  const ledgerState = await getWelcomeLedgerState(providers, welcomeContract.finalizedDeployTxData.contractAddress);
  const privateState = await getWelcomePrivateState(providers);
  if (ledgerState !== null && privateState !== null) {
    logger.info(`Organizers: [${[...ledgerState.organizerPks].map(toHex).join(', ')}]`);
    logger.info(`Eligible participants: [${[...ledgerState.eligibleParticipants].join(', ')}]`);
    logger.info(`Checked-in participants: [${[...ledgerState.checkedInParticipants].join(', ')}]`);
  }
  if (ledgerState === null) {
    logger.warn('Contract has not been deployed');
    return;
  }
  if (privateState === null) {
    logger.warn('User has not joined');
  }
};

const displayLocalState = async (
  providers: WelcomeProviders,
  welcomeContract: DeployedWelcomeContract,
  logger: Logger,
): Promise<void> => {
  const ledgerState = await getWelcomeLedgerState(providers, welcomeContract.finalizedDeployTxData.contractAddress);
  const privateState = await getWelcomePrivateState(providers);
  if (ledgerState !== null && privateState !== null) {
    const { organizerSecretKey } = privateState;
    if (organizerSecretKey === null) {
      logger.info('role: spectator');
      logger.info('secretKey: undefined');
      logger.info('publicKey: undefined');
      return;
    }
    const { organizerPks } = ledgerState;
    const organizerPk = pureCircuits.public_key(organizerSecretKey);
    logger.info(`role: ${organizerPks.member(organizerPk) ? 'organizer' : 'spectator'}`);
    logger.info(`secretKey: ${toHex(organizerSecretKey)}`);
    logger.info(`publicKey: ${toHex(organizerPk)}`);
    return;
  }
  if (ledgerState === null) {
    logger.warn('Contract has not been deployed');
    return;
  }
  if (privateState === null) {
    logger.warn('User has not joined');
  }
};

const displayWalletBalance = async (wallet: Wallet, logger: Logger) => {
  const state = await Rx.firstValueFrom(wallet.state());
  const balance = state.balances[nativeToken()] ?? 0;
  logger.info(`Your wallet balance is: ${balance}`);
};

const MAIN_LOOP_QUESTION = `
Choose one of the following:
  1. Add a participant
  2. Add an organizer
  3. Display local state
  4. Display ledger state
  5. Display wallet balance
  6. Exit
`;

const mainLoop = async (
  providers: WelcomeProviders,
  initialParticipants: string[],
  rli: Interface,
  wallet: Wallet,
  logger: Logger,
): Promise<void> => {
  const welcomeContract = await deployOrJoin(providers, initialParticipants, rli, logger);
  while (true) {
    const choice = await rli.question(MAIN_LOOP_QUESTION);
    switch (choice) {
      case '1':
        await addParticipant(welcomeContract, rli, logger);
        break;
      case '2':
        await addOrganizer(welcomeContract, rli, logger);
        break;
      case '3':
        await displayLocalState(providers, welcomeContract, logger);
        break;
      case '4':
        await displayLedgerState(providers, welcomeContract, logger);
        break;
      case '5':
        await displayWalletBalance(wallet, logger);
        break;
      case '6':
        logger.info('Goodbye');
        return;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

const createWalletAndMidnightProvider = async (wallet: Wallet): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
  return {
    coinPublicKey: state.coinPublicKey,
    balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
      return wallet
        .balanceTransaction(ZswapTransaction.deserialize(tx.tx.serialize()), newCoins)
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) => Transaction.deserialize(zswapTx.serialize()))
        .then(createBalancedTx);
    },
    submitTx(tx: BalancedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx.tx);
    },
  };
};

const waitForFunds = (wallet: Wallet, logger: Logger) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((state) => {
        const scanned = state.syncProgress?.synced ?? 0n;
        const total = state.syncProgress?.total.toString() ?? 'unknown number';
        logger.info(`Wallet scanned ${scanned} blocks out of ${total}`);
      }),
      Rx.filter((state) => {
        // Let's allow progress only if wallet is close enough
        const synced = state.syncProgress?.synced ?? 0n;
        const total = state.syncProgress?.total ?? 1_000n;
        return total - synced < 100n;
      }),
      Rx.map((s) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  logger: Logger,
  seed: string,
): Promise<Wallet & Resource> => {
  const wallet = await WalletBuilder.buildFromSeed(indexer, indexerWS, proofServer, node, seed, 'warn');
  wallet.start();
  const state = await Rx.firstValueFrom(wallet.state());
  logger.info(`Your wallet seed is: ${seed}`);
  logger.info(`Your wallet address is: ${state.address}`);
  let balance = state.balances[nativeToken()];
  if (balance === undefined || balance === 0n) {
    logger.info(`Your wallet balance is: 0`);
    logger.info(`Waiting to receive tokens...`);
    balance = await waitForFunds(wallet, logger);
  }
  logger.info(`Your wallet balance is: ${balance}`);
  return wallet;
};

const buildFreshWallet = async (config: Config, logger: Logger): Promise<Wallet & Resource> =>
  await buildWalletAndWaitForFunds(config, logger, toHex(randomWalletSeed()));

const buildWalletFromSeed = async (config: Config, rli: Interface, logger: Logger): Promise<Wallet & Resource> => {
  const seed = await rli.question('Enter your wallet seed:');
  return await buildWalletAndWaitForFunds(config, logger, seed);
};

const WALLET_LOOP_QUESTION = `
Choose one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
`;

const buildWallet = async (config: Config, rli: Interface, logger: Logger): Promise<Wallet & Resource> => {
  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case '1':
        return await buildFreshWallet(config, logger);
      case '2':
        return await buildWalletFromSeed(config, rli, logger);
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

export const run = async (config: Config, logger: Logger, dockerEnv?: DockerComposeEnvironment): Promise<void> => {
  const rli = createInterface({ input, output, terminal: true });
  let env;
  if (dockerEnv !== undefined) {
    env = await dockerEnv.up();
  }
  const wallet = await buildWallet(config, rli, logger);
  try {
    const walletAndMidnightProvider = await createWalletAndMidnightProvider(wallet);
    const providers = {
      privateStateProvider: levelPrivateStateProvider<PrivateStates>({
        privateStateStoreName: config.privateStateStoreName,
      }),
      publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
      zkConfigProvider: new NodeZkConfigProvider<WelcomeCircuitKeys>(config.zkConfigPath),
      proofProvider: httpClientProofProvider(config.proofServer),
      walletProvider: walletAndMidnightProvider,
      midnightProvider: walletAndMidnightProvider,
    };
    await mainLoop(providers, config.initialParticipants, rli, wallet, logger);
  } catch (e) {
    if (e instanceof Error) {
      logger.error(`Found error '${e.message}'`);
      logger.info('Exiting...');
    } else {
      throw e;
    }
  } finally {
    try {
      rli.close();
      rli.removeAllListeners();
    } catch (e) {
    } finally {
      try {
        if (wallet !== null) {
          await wallet.close();
        }
      } catch (e) {
      } finally {
        try {
          if (env !== undefined) {
            await env.down();
            logger.info('Goodbye');
          }
        } catch (e) {}
      }
    }
  }
};
