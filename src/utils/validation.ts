export const closeTo = (a: number, b: number, delta = 0.001): boolean => {
  if (b === 0) return a === 0;
  return Math.abs(1 - a / b) < delta;
};

export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const isValidEvmTransactionHash = (hash: string): boolean => {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
};

export const isValidSolanaAddress = (address: string): boolean => {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

export const isValidSolanaSignature = (signature: string): boolean => {
  return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature);
};

export const normalizeAddress = (address: string): string => {
  return address.toLowerCase().trim();
};

export const isTimestampValid = (
  txTimestamp: number,
  donationTimestamp: number,
  thresholdSeconds = 3600,
): boolean => {
  return donationTimestamp - txTimestamp <= thresholdSeconds;
};
