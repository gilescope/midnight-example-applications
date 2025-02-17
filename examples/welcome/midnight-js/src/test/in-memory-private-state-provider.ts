import { PrivateStateProvider, PrivateStateSchema } from '@midnight-ntwrk/midnight-js-types';

/**
 * A simple in-memory implementation of private state provider. Makes it easy to capture and rewrite private state from deploy
 */
export const inMemoryPrivateStateProvider = <PSS extends PrivateStateSchema>(): PrivateStateProvider<PSS> => {
  const record: PSS = {} as PSS;
  return {
    set<PSK extends keyof PSS>(key: PSK, state: PSS[PSK]): Promise<void> {
      record[key] = state;
      return Promise.resolve();
    },
    get<PSK extends keyof PSS>(key: PSK): Promise<PSS[PSK] | null> {
      const value = record[key] ?? null;
      return Promise.resolve(value);
    },
    remove<PSK extends keyof PSS>(key: PSK): Promise<void> {
      delete record[key];
      return Promise.resolve();
    },
    clear(): Promise<void> {
      Object.keys(record).forEach((key) => {
        delete record[key];
      });
      return Promise.resolve();
    },
  };
};
