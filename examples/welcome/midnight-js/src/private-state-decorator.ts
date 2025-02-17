import { PrivateStateProvider, PrivateStateSchema } from '@midnight-ntwrk/midnight-js-types';
import { concatMap, delay, Observable, of, retry, startWith, Subject } from 'rxjs';
import { Logger } from 'pino';

const notification: unique symbol = Symbol('notification');

export interface SubscribablePrivateStateProvider<PSS extends PrivateStateSchema> extends PrivateStateProvider<PSS> {
  state$<PSK extends keyof PSS>(key: PSK): Observable<PSS[PSK] | null>;
}

export class SubscribablePrivateStateProviderDecorator<PSS extends PrivateStateSchema>
  implements SubscribablePrivateStateProvider<PSS>
{
  #internalSubject = new Subject<typeof notification>();

  constructor(
    private readonly logger: Logger,
    private readonly wrapped: PrivateStateProvider<PSS>,
  ) {}
  state$<PSK extends keyof PSS>(key: PSK): Observable<PSS[PSK] | null> {
    return this.#internalSubject.asObservable().pipe(
      startWith(notification),
      concatMap(() => this.get(key)),
      retry({
        count: 15,
        resetOnSuccess: true,
        delay: (error, count) => {
          const retryDelay = Math.random() * 5 * 2 ** count;
          this.logger.trace(
            { err: error, retryDelay },
            `SubscribablePrivateStateProviderDecorator faced an error when reading state, retrying in ${retryDelay}ms`,
          );
          return of(true).pipe(delay(retryDelay));
        },
      }),
    );
  }
  clear(): Promise<void> {
    return this.wrapped.clear().then(this.#notify);
  }

  get<PSK extends keyof PSS>(key: PSK): Promise<PSS[PSK] | null> {
    return this.wrapped.get(key);
  }

  remove<PSK extends keyof PSS>(key: PSK): Promise<void> {
    return this.wrapped.remove(key).then(this.#notify);
  }

  set<PSK extends keyof PSS>(key: PSK, state: PSS[PSK]): Promise<void> {
    return this.wrapped.set(key, state).then(this.#notify);
  }

  #notify = <T>(input: T): T => {
    this.#internalSubject.next(notification);
    return input;
  };
}
