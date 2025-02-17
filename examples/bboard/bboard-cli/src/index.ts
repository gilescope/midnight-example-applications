/*
 * This file is the main driver for the Midnight bulletin board example.
 * The entry point is the run function, at the end of the file.
 * We expect the startup files (devnet-remote.ts, standalone.ts, etc.) to
 * call run with some specific configuration that sets the network addresses
 * of the servers this file relies on.
 */

import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { WebSocket } from 'ws';
import { webcrypto } from 'crypto';
import {
  type BBoardContract,
  type BBoardProviders,
  type DeployedBBoardContract,
  type PrivateStates,
} from './common-types.js';
import { deployContract, findDeployedContract, withZswapWitnesses } from '@midnight-ntwrk/midnight-js-contracts';
import {
  ledger,
  witnesses,
  Contract,
  type Ledger,
  createBBoardPrivateState,
  STATE,
} from '@midnight-ntwrk/bboard-contract';
import {
  type BalancedTransaction,
  createBalancedTx,
  type MidnightProvider,
  type UnbalancedTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import * as Rx from 'rxjs';
import { type CoinInfo, nativeToken, Transaction, type TransactionId } from '@midnight-ntwrk/ledger';
import { Transaction as ZswapTransaction } from '@midnight-ntwrk/zswap';
import { type CoinPublicKey, type ContractAddress, encodeCoinPublicKey } from '@midnight-ntwrk/compact-runtime';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type Resource, WalletBuilder } from '@midnight-ntwrk/wallet';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { type Logger } from 'pino';
import { type Config, StandaloneConfig } from './config.js';
import { toHex } from './conversion-utils.js';
import { type DockerComposeEnvironment } from 'testcontainers';
import * as crypto from 'crypto';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';

// @ts-expect-error: It's needed to make Scala.js and WASM code able to use cryptography
globalThis.crypto = webcrypto;

// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

/* **********************************************************************
 * getBBoardLedgerState: a helper that queries the current state of
 * the data on the ledger, for a specific bulletin board contract.
 * Note that the Ledger type returned here is not some generic,
 * abstract ledger object, but specifically the type generated by
 * the Compact compiler to correspond to the ledger declaration
 * in the bulletin board contract.
 */

export const getBBoardLedgerState = (
  providers: BBoardProviders,
  contractAddress: ContractAddress,
): Promise<Ledger | null> =>
  providers.publicDataProvider
    .queryContractState(contractAddress)
    .then((contractState) => (contractState != null ? ledger(contractState.data) : null));

/* **********************************************************************
 * createBBoardContract: create an undeployed contract object,
 * associated with the given wallet key and the witness
 * implementations defined over in the contract sub-project.
 */

export const createBBoardContract = (coinPublicKey: CoinPublicKey): BBoardContract =>
  new Contract(withZswapWitnesses(witnesses)(encodeCoinPublicKey(coinPublicKey)));

/* **********************************************************************
 * join: find an already-deployed bulletin board contract on the
 * network and join it.  The user is prompted for the existing
 * contract's address.
 */

const join = async (providers: BBoardProviders, rli: Interface, logger: Logger): Promise<DeployedBBoardContract> => {
  const contractAddress = await rli.question('What is the contract address (in hex)? ');
  const existingPrivateState = await providers.privateStateProvider.get('bboardPrivateState');
  const deployedBBoardContract = await findDeployedContract(
    providers,
    contractAddress,
    createBBoardContract(providers.walletProvider.coinPublicKey),
    {
      privateStateKey: 'bboardPrivateState',
      initialPrivateState: existingPrivateState ?? createBBoardPrivateState(randomBytes(32)),
    },
  );
  logger.info(`Joined the contract at address: ${deployedBBoardContract.finalizedDeployTxData.contractAddress}`);
  return deployedBBoardContract;
};

/* **********************************************************************
 * deploy: deploy a brand new bulletin board contract to the network.
 */

const deploy = async (providers: BBoardProviders, logger: Logger): Promise<DeployedBBoardContract> => {
  logger.info(`Deploying a new bulletin board contract...`);
  const deployedBBoardContract = await deployContract(
    // EXERCISE 3: FILL IN THE CORRECT ARGUMENTS TO deployContract
    providers, // EXERCISE ANSWER
    'bboardPrivateState', // EXERCISE ANSWER
    createBBoardPrivateState(randomBytes(32)), // EXERCISE ANSWER
    createBBoardContract(providers.walletProvider.coinPublicKey), // EXERCISE ANSWER
  );
  logger.info(`Deployed contract at address: ${deployedBBoardContract.finalizedDeployTxData.contractAddress}`);
  return deployedBBoardContract;
};

/* **********************************************************************
 * deployOrJoin: returns a contract, by prompting the user about
 * whether to deploy a new one or join an existing one and then
 * calling the appropriate helper.
 */

const DEPLOY_OR_JOIN_QUESTION = `
You can do one of the following:
  1. Deploy a new bulletin board contract
  2. Join an existing bulletin board contract
  3. Exit
Which would you like to do? `;

const deployOrJoin = async (
  providers: BBoardProviders,
  rli: Interface,
  logger: Logger,
): Promise<DeployedBBoardContract | null> => {
  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
    switch (choice) {
      case '1':
        return await deploy(providers, logger);
      case '2':
        return await join(providers, rli, logger);
      case '3':
        logger.info('Exiting...');
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * post: prompt for a message to post and then call the post circuit
 * on the given contract.
 */

const POST_QUESTION = `What message do you want to post? `;

const post = async (deployedBBoardContract: DeployedBBoardContract, logger: Logger, rli: Interface): Promise<void> => {
  const message = await rli.question(POST_QUESTION);
  logger.info('Posting your message...');
  const { txHash, blockHeight } =
    // EXERCISE 4: CALL THE post CIRCUIT AND SUBMIT THE TRANSACTION TO THE NETWORK
    await deployedBBoardContract.contractCircuitsInterface // EXERCISE ANSWER
      .post(message) // EXERCISE ANSWER
      .then((u) => u.submit()); // EXERCISE ANSWER
  logger.info(`Transaction ${txHash} added in block ${blockHeight}`);
};

/* **********************************************************************
 * takeDown: call the takeDown circuit on the given contract.
 */

const takeDown = async (deployedBBoardContract: DeployedBBoardContract, logger: Logger): Promise<void> => {
  logger.info('Taking down your last posted message...');
  const { txHash, blockHeight } =
    // EXERCISE 5: CALL THE take_down CIRCUIT AND SUBMIT THE TRANSACTION TO THE NETWORK
    await deployedBBoardContract.contractCircuitsInterface // EXERCISE ANSWER
      .take_down() // EXERCISE ANSWER
      .then((u) => u.submit()); // EXERCISE ANSWER
  logger.info(`Transaction ${txHash} added in block ${blockHeight}`);
};

/* **********************************************************************
 * displayLedgerState: shows the values of each of the fields declared
 * by the contract to be in the ledger state of the bulletin board.
 */

const displayLedgerState = async (
  providers: BBoardProviders,
  deployedBBoardContract: DeployedBBoardContract,
  logger: Logger,
): Promise<void> => {
  const contractAddress = deployedBBoardContract.finalizedDeployTxData.contractAddress;
  const ledgerState = await getBBoardLedgerState(providers, contractAddress);
  if (ledgerState === null) {
    logger.info(`There is no bulletin board contract deployed at ${contractAddress}`);
  } else {
    const boardState = ledgerState.state === STATE.occupied ? 'occupied' : 'vacant';
    const latestMessage = !ledgerState.message.is_some ? 'none' : ledgerState.message.value;
    logger.info(`Current state is: '${boardState}'`);
    logger.info(`Current message is: '${latestMessage}'`);
    logger.info(`Current instance is: ${ledgerState.instance}`);
    logger.info(`Current poster is: '${toHex(ledgerState.poster)}'`);
  }
};

/* **********************************************************************
 * displayPrivateState: shows the hex-formatted value of the secret key.
 */

const displayPrivateState = async (providers: BBoardProviders, logger: Logger): Promise<void> => {
  const privateState = await providers.privateStateProvider.get('bboardPrivateState');
  if (privateState === null) {
    logger.info(`There is no existing bulletin board private state`);
  } else {
    logger.info(`Current secret key is: ${toHex(privateState.secretKey)}`);
  }
};

/* **********************************************************************
 * mainLoop: the main interactive menu of the bulletin board CLI.
 * Before starting the loop, the user is prompted to deploy a new
 * contract or join an existing one.
 */

const MAIN_LOOP_QUESTION = `
You can do one of the following:
  1. Post a message
  2. Take down your message
  3. Display the current ledger state (known by everyone)
  4. Display the current private state (known only to this DApp instance)
  5. Exit
Which would you like to do? `;

const mainLoop = async (providers: BBoardProviders, rli: Interface, logger: Logger): Promise<void> => {
  const deployedBBoardContract = await deployOrJoin(providers, rli, logger);
  if (deployedBBoardContract === null) {
    return;
  }
  while (true) {
    const choice = await rli.question(MAIN_LOOP_QUESTION);
    switch (choice) {
      case '1':
        await post(deployedBBoardContract, logger, rli);
        break;
      case '2':
        await takeDown(deployedBBoardContract, logger);
        break;
      case '3':
        await displayLedgerState(providers, deployedBBoardContract, logger);
        break;
      case '4':
        await displayPrivateState(providers, logger);
        break;
      case '5':
        logger.info('Exiting...');
        return;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * createWalletAndMidnightProvider: returns an object that
 * satifies both the WalletProvider and MidnightProvider
 * interfaces, both implemented in terms of the given wallet.
 */

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

/* **********************************************************************
 * waitForFunds: wait for tokens to appear in a wallet.
 *
 * This is an interesting example of watching the stream of states
 * coming from the pub-sub indexer.  It watches both
 *  1. how close the state is to present reality and
 *  2. the balance held by the wallet.
 */

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

/* **********************************************************************
 * buildWalletAndWaitForFunds: the main function that creates a wallet
 * and waits for tokens to appear in it.  The various "buildWallet"
 * functions all arrive here after collecting information for the
 * arguments.
 */

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

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

// Generate a random see and create the wallet with that.
const buildFreshWallet = async (config: Config, logger: Logger): Promise<Wallet & Resource> =>
  await buildWalletAndWaitForFunds(config, logger, toHex(randomBytes(32)));

// Prompt for a seed and create the wallet with that.
const buildWalletFromSeed = async (config: Config, rli: Interface, logger: Logger): Promise<Wallet & Resource> => {
  const seed = await rli.question('Enter your wallet seed: ');
  return await buildWalletAndWaitForFunds(config, logger, seed);
};

/* ***********************************************************************
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000042';

/* **********************************************************************
 * buildWallet: unless running in a standalone (offline) mode,
 * prompt the user to tell us whether to create a new wallet
 * or recreate one from a prior seed.
 */

const WALLET_LOOP_QUESTION = `
You can do one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Exit
Which would you like to do? `;

const buildWallet = async (config: Config, rli: Interface, logger: Logger): Promise<(Wallet & Resource) | null> => {
  if (config instanceof StandaloneConfig) {
    return await buildWalletAndWaitForFunds(config, logger, GENESIS_MINT_WALLET_SEED);
  }
  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case '1':
        return await buildFreshWallet(config, logger);
      case '2':
        return await buildWalletFromSeed(config, rli, logger);
      case '3':
        logger.info('Exiting...');
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * run: the main entry point that starts the whole bulletin board CLI.
 *
 * If called with a Docker environment argument, the application
 * will wait for Docker to be ready before doing anything else.
 */

export const run = async (config: Config, logger: Logger, dockerEnv?: DockerComposeEnvironment): Promise<void> => {
  const rli = createInterface({ input, output, terminal: true });
  let env;
  if (dockerEnv !== undefined) {
    env = await dockerEnv.up();
  }
  const wallet = await buildWallet(config, rli, logger);
  try {
    if (wallet !== null) {
      const walletAndMidnightProvider = await createWalletAndMidnightProvider(wallet);
      const providers = {
        privateStateProvider: levelPrivateStateProvider<PrivateStates>({
          privateStateStoreName: config.privateStateStoreName,
        }),
        publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
        zkConfigProvider: new NodeZkConfigProvider<'post' | 'take_down'>(config.zkConfigPath),
        proofProvider: httpClientProofProvider(config.proofServer),
        walletProvider: walletAndMidnightProvider,
        midnightProvider: walletAndMidnightProvider,
      };
      await mainLoop(providers, rli, logger);
    }
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
