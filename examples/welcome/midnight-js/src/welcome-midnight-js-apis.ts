import {
  AppProviders,
  WelcomeCircuitKeys,
  WelcomeContract,
  WelcomeProviders,
  DeployedWelcomeContract,
  PrivateStates,
  UnsubmittedWelcomeCallTx,
} from './common-types.js';
import {
  CallTxFailed,
  deployContract,
  findDeployedContract,
  StateWithZswap,
  withZswapWitnesses,
} from '@midnight-ntwrk/midnight-js-contracts';
import {
  Contract,
  WelcomePrivateState,
  createOrganizerWelcomePrivateState,
  createParticipantWelcomePrivateState,
  ledger,
  Witnesses,
  witnesses,
  Ledger,
  INITIAL_PARTICIPANTS_VECTOR_LENGTH,
  Maybe,
  pureCircuits,
} from '@midnight-ntwrk/welcome-contract';
import { ContractAddress, encodeCoinPublicKey } from '@midnight-ntwrk/compact-runtime';
import { FinalizedTxData, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import {
  Action,
  ActionHistory,
  ActionId,
  Actions,
  AsyncActionStates,
  OrganizerWelcomeAPI,
  OrganizerWelcomeState,
  ParticipantWelcomeAPI,
  ParticipantWelcomeState,
} from '@midnight-ntwrk/welcome-api';
import * as Rx from 'rxjs';
import { deriveOrganizerWelcomeState } from './derive-organizer-welcome-state.js';
import { EphemeralState } from './ephemeral-state-bloc.js';
import { deriveParticipantWelcomeState } from './derive-participant-welcome-state.js';
import { prettifyLedgerState, prettifyOrganizerState, prettifyParticipantState } from './prettify-utils.js';

export const createWelcomeContract = (walletProvider: WalletProvider): WelcomeContract =>
  new Contract(withZswapWitnesses(witnesses)(encodeCoinPublicKey(walletProvider.coinPublicKey)));

export const getWelcomePrivateState = (providers: WelcomeProviders): Promise<WelcomePrivateState | null> =>
  providers.privateStateProvider.get('welcomePrivateState');

const getOrganizerSecretKey = async (providers: WelcomeProviders): Promise<Uint8Array> => {
  const privateState = await getWelcomePrivateState(providers);
  if (privateState === null) {
    throw new Error('Unexpected undefined private state');
  }
  if (privateState.organizerSecretKey === null) {
    throw new Error('Unexpected undefined secret key');
  }
  return privateState.organizerSecretKey;
};

const buildAndSubmitCallTx = (
  appProviders: AppProviders,
  action: Action,
  buildTx: () => Promise<UnsubmittedWelcomeCallTx>,
): Promise<ActionId> => {
  const actionId = appProviders.crypto.randomUUID();
  void Rx.firstValueFrom(
    appProviders.ephemeralStateBloc
      .addAction({
        action,
        status: AsyncActionStates.inProgress,
        startedAt: new Date(),
        id: actionId,
      })
      .pipe(
        Rx.concatMap(() => buildTx()),
        Rx.tap(() => appProviders.logger.info({ submittingTransaction: action })),
        Rx.concatMap((u) =>
          u.submit().then((finalizedTxData) => {
            appProviders.logger.info({
              transactionFinalized: {
                circuitId: u.callTxData.circuitId,
                status: finalizedTxData.status,
                txId: finalizedTxData.txId,
                txHash: finalizedTxData.txHash,
                blockHeight: finalizedTxData.blockHeight,
              },
            });
            return finalizedTxData;
          }),
        ),
        Rx.concatMap((finalizedTxData) => appProviders.ephemeralStateBloc.succeedAction(actionId, finalizedTxData)),
        Rx.catchError((error: Error) =>
          appProviders.ephemeralStateBloc.failAction(
            actionId,
            error.message,
            error instanceof CallTxFailed ? error.finalizedTxData : undefined,
          ),
        ),
      ),
  );
  return Promise.resolve(actionId);
};

const actionHistoriesEqual = (a: ActionHistory, b: ActionHistory): boolean =>
  a.latest === b.latest &&
  Object.keys(a.all).length === Object.keys(b.all).length &&
  Object.keys(a.all).every((key) => key in b.all && a.all[key].status === b.all[key].status);

const organizerStatesEqual = (a: OrganizerWelcomeState, b: OrganizerWelcomeState): boolean =>
  a.secretKey === b.secretKey && a.publicKey === b.publicKey && a.role === b.role && actionHistoriesEqual(a.actions, b.actions);

const createStateObservable = <W extends OrganizerWelcomeState | ParticipantWelcomeState>(
  providers: WelcomeProviders,
  appProviders: AppProviders,
  contractAddress: ContractAddress,
  derivation: (ledgerState: Ledger, privateState: WelcomePrivateState, ephemeralState: EphemeralState) => W,
  equals: (a: W, b: W) => boolean,
  prettify: (w: W) => object,
): Rx.Observable<W> => {
  return Rx.combineLatest(
    [
      providers.publicDataProvider.contractStateObservable(contractAddress, { type: 'latest' }).pipe(
        Rx.map((contractState) => ledger(contractState.data)),
        Rx.tap((ledgerState) => {
          appProviders.logger.info({ ledgerState: prettifyLedgerState(ledgerState) });
        }),
      ),
      Rx.from(getWelcomePrivateState(providers)).pipe(
        Rx.concatMap((existingPrivateState) =>
          providers.privateStateProvider.state$('welcomePrivateState').pipe(
            Rx.startWith(existingPrivateState),
            Rx.filter((privateState): privateState is WelcomePrivateState => privateState !== null),
          ),
        ),
      ),
      appProviders.ephemeralStateBloc.state$,
    ],
    derivation,
  ).pipe(
    Rx.distinctUntilChanged(equals),
    Rx.tap((w) => appProviders.logger.info({ localState: prettify(w) })),
    Rx.shareReplay({ bufferSize: 1, refCount: true }),
  );
};

export const createParticipantsMaybeVector = (initialParticipants: string[]): Maybe<string>[] =>
  initialParticipants
    .map((p) => ({
      is_some: true,
      value: p,
    }))
    .concat(
      Array(INITIAL_PARTICIPANTS_VECTOR_LENGTH - initialParticipants.length).fill({
        is_some: false,
        value: '',
      }),
    );

// TODO: extract deploy and join functions that work for organizer and participant APIs.
export class OrganizerWelcomeMidnightJSAPI implements OrganizerWelcomeAPI {
  static async deploy(
    providers: WelcomeProviders,
    appProviders: AppProviders,
    initialParticipants: string[],
  ): Promise<OrganizerWelcomeMidnightJSAPI> {
    const deployedContract = await deployContract<
      PrivateStates,
      'welcomePrivateState',
      Witnesses<StateWithZswap<WelcomePrivateState>>,
      WelcomeContract,
      WelcomeCircuitKeys
    >(
      providers,
      'welcomePrivateState',
      createOrganizerWelcomePrivateState(appProviders.crypto.randomSk()),
      createWelcomeContract(providers.walletProvider),
      createParticipantsMaybeVector(initialParticipants),
    );
    appProviders.logger.info({
      contractDeployed: {
        address: deployedContract.finalizedDeployTxData.contractAddress,
        block: deployedContract.finalizedDeployTxData.blockHeight,
      },
    });
    const secretKey = await getOrganizerSecretKey(providers);
    return new OrganizerWelcomeMidnightJSAPI(deployedContract, providers, appProviders, secretKey);
  }

  static async join(
    providers: WelcomeProviders,
    appProviders: AppProviders,
    contractAddress: ContractAddress,
  ): Promise<OrganizerWelcomeMidnightJSAPI> {
    const existingPrivateState = await getWelcomePrivateState(providers);
    const deployedContract = await findDeployedContract<
      PrivateStates,
      'welcomePrivateState',
      Witnesses<StateWithZswap<WelcomePrivateState>>,
      WelcomeContract,
      WelcomeCircuitKeys
    >(providers, contractAddress, createWelcomeContract(providers.walletProvider), {
      privateStateKey: 'welcomePrivateState',
      initialPrivateState: existingPrivateState || createOrganizerWelcomePrivateState(appProviders.crypto.randomSk()),
    });
    appProviders.logger.info({
      contractJoined: {
        address: deployedContract.finalizedDeployTxData.contractAddress,
      },
    });
    const secretKey = await getOrganizerSecretKey(providers);
    return new OrganizerWelcomeMidnightJSAPI(deployedContract, providers, appProviders, secretKey);
  }

  readonly contractAddress: ContractAddress;
  readonly finalizedDeployTxData: FinalizedTxData;
  readonly initialLedgerState: Ledger;
  readonly publicKey: Uint8Array;
  readonly state$: Rx.Observable<OrganizerWelcomeState>;

  constructor(
    private readonly deployedContract: DeployedWelcomeContract,
    private readonly providers: WelcomeProviders,
    private readonly appProviders: AppProviders,
    readonly secretKey: Uint8Array,
  ) {
    this.contractAddress = deployedContract.finalizedDeployTxData.contractAddress;
    this.finalizedDeployTxData = (({ status, txHash, txId, blockHash, blockHeight }) => ({
      status,
      txHash,
      txId,
      blockHash,
      blockHeight,
    }))(deployedContract.finalizedDeployTxData);
    this.initialLedgerState = ledger(deployedContract.finalizedDeployTxData.initialContractState.data);
    this.publicKey = pureCircuits.public_key(secretKey);
    this.state$ = createStateObservable(
      this.providers,
      this.appProviders,
      this.contractAddress,
      deriveOrganizerWelcomeState,
      organizerStatesEqual,
      prettifyOrganizerState,
    );
  }

  addParticipant(participantId: string): Promise<ActionId> {
    return buildAndSubmitCallTx(this.appProviders, Actions.addParticipant, () =>
      this.deployedContract.contractCircuitsInterface.add_participant(participantId),
    );
  }

  addOrganizer(organizerPk: Uint8Array): Promise<ActionId> {
    return buildAndSubmitCallTx(this.appProviders, Actions.addOrganizer, () =>
      this.deployedContract.contractCircuitsInterface.add_organizer(organizerPk),
    );
  }
}

const participantStatesEqual = (a: ParticipantWelcomeState, b: ParticipantWelcomeState): boolean =>
  a.participantId === b.participantId && a.isCheckedIn === b.isCheckedIn && actionHistoriesEqual(a.actions, b.actions);

export class ParticipantWelcomeMidnightJSAPI implements ParticipantWelcomeAPI {
  static async join(
    providers: WelcomeProviders,
    appProviders: AppProviders,
    contractAddress: ContractAddress,
  ): Promise<ParticipantWelcomeMidnightJSAPI> {
    appProviders.logger.info({ joiningContract: contractAddress });
    const existingPrivateState = await getWelcomePrivateState(providers);
    const deployedContract = await findDeployedContract<
      PrivateStates,
      'welcomePrivateState',
      Witnesses<StateWithZswap<WelcomePrivateState>>,
      WelcomeContract,
      WelcomeCircuitKeys
    >(providers, contractAddress, createWelcomeContract(providers.walletProvider), {
      privateStateKey: 'welcomePrivateState',
      initialPrivateState: existingPrivateState || createParticipantWelcomePrivateState(),
    });
    appProviders.logger.info({
      contractJoined: {
        address: deployedContract.finalizedDeployTxData.contractAddress,
      },
    });
    return new ParticipantWelcomeMidnightJSAPI(deployedContract, providers, appProviders);
  }

  readonly contractAddress: ContractAddress;
  readonly state$: Rx.Observable<ParticipantWelcomeState>;

  constructor(
    private readonly deployedContract: DeployedWelcomeContract,
    private readonly providers: WelcomeProviders,
    private readonly appProviders: AppProviders,
  ) {
    this.contractAddress = deployedContract.finalizedDeployTxData.contractAddress;
    this.state$ = createStateObservable(
      this.providers,
      this.appProviders,
      this.contractAddress,
      deriveParticipantWelcomeState,
      participantStatesEqual,
      prettifyParticipantState,
    );
  }

  checkIn(participantId: string): Promise<ActionId> {
    return buildAndSubmitCallTx(this.appProviders, Actions.checkIn, () =>
      this.deployedContract.contractCircuitsInterface.check_in(participantId),
    );
  }
}
