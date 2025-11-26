/**
 * Validation utilities for transaction verification
 */

/**
 * Compare two numbers with a delta as margin of error
 * @param a First number
 * @param b Second number
 * @param delta Margin of error (default: 0.001 or 0.1%)
 * @returns true if numbers are close enough
 */
export const closeTo = (a: number, b: number, delta = 0.001): boolean => {
  if (b === 0) return a === 0;
  return Math.abs(1 - a / b) < delta;
};

/**
 * Validate Ethereum address format
 * @param address The address to validate
 * @returns true if valid Ethereum address
 */
export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate transaction hash format for EVM chains
 * @param hash The hash to validate
 * @returns true if valid transaction hash
 */
export const isValidEvmTransactionHash = (hash: string): boolean => {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
};

/**
 * Validate Solana address format
 * @param address The address to validate
 * @returns true if valid Solana address
 */
export const isValidSolanaAddress = (address: string): boolean => {
  // Solana addresses are base58 encoded and typically 32-44 characters
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

/**
 * Validate Solana transaction signature
 * @param signature The signature to validate
 * @returns true if valid Solana signature
 */
export const isValidSolanaSignature = (signature: string): boolean => {
  // Solana signatures are base58 encoded and typically 88 characters
  return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature);
};

/**
 * Validate Stellar address format
 * @param address The address to validate
 * @returns true if valid Stellar address
 */
export const isValidStellarAddress = (address: string): boolean => {
  // Stellar addresses start with G and are 56 characters
  return /^G[A-Z2-7]{55}$/.test(address);
};

/**
 * Validate Cardano address format
 * @param address The address to validate
 * @returns true if valid Cardano address
 */
export const isValidCardanoAddress = (address: string): boolean => {
  // Cardano addresses start with addr1 or addr_test1
  return /^(addr1|addr_test1)[a-z0-9]{50,}$/.test(address);
};

/**
 * Normalize address to lowercase for comparison
 * @param address The address to normalize
 * @returns normalized address
 */
export const normalizeAddress = (address: string): string => {
  return address.toLowerCase().trim();
};

/**
 * Check if timestamp is within acceptable range
 * @param txTimestamp Transaction timestamp
 * @param donationTimestamp Donation creation timestamp
 * @param thresholdSeconds Maximum time difference in seconds (default: 3600 = 1 hour)
 * @returns true if within acceptable range
 */
export const isTimestampValid = (
  txTimestamp: number,
  donationTimestamp: number,
  thresholdSeconds = 3600,
): boolean => {
  // Transaction should not be older than donation by more than threshold
  return donationTimestamp - txTimestamp <= thresholdSeconds;
};

