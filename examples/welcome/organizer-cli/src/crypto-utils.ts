const SK_LENGTH = 32;

export const randomBytes = (length: number): Uint8Array => {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
};

export const randomSk = (): Uint8Array => randomBytes(SK_LENGTH);

const WALLET_SEED_LENGTH = 32;

export const randomWalletSeed = (): Uint8Array => randomBytes(WALLET_SEED_LENGTH);
