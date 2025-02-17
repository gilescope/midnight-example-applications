import { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { Cryptography } from './cryptography.js';
import { Logger } from 'pino';
import { Witnesses, WelcomePrivateState, Contract } from '@midnight-ntwrk/welcome-contract';
import { SubscribablePrivateStateProvider } from './private-state-decorator.js';
import { DeployedContract, StateWithZswap, UnsubmittedCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { EphemeralStateBloc } from './ephemeral-state-bloc.js';

export type PrivateStates = {
  welcomePrivateState: WelcomePrivateState;
};

export type WelcomeContract = Contract<StateWithZswap<WelcomePrivateState>, Witnesses<StateWithZswap<WelcomePrivateState>>>;

export type WelcomeCircuitKeys = Exclude<keyof WelcomeContract['impureCircuits'], number | symbol>;

export type WelcomeProviders = MidnightProviders<WelcomeCircuitKeys, PrivateStates> & {
  privateStateProvider: SubscribablePrivateStateProvider<PrivateStates>;
};

export type AppProviders = {
  crypto: Cryptography;
  logger: Logger;
  ephemeralStateBloc: EphemeralStateBloc;
};

export type DeployedWelcomeContract = DeployedContract<PrivateStates, 'welcomePrivateState', WelcomeContract>;

export type UnsubmittedWelcomeCallTx = UnsubmittedCallTx<
  PrivateStates,
  'welcomePrivateState',
  WelcomeContract,
  WelcomeCircuitKeys
>;
