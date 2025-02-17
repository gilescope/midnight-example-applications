export const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

export const fromHex = (hex: string): Uint8Array => Buffer.from(hex, 'hex');
