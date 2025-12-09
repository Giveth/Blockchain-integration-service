/**
 * Supported blockchain chain types
 */
export enum ChainType {
  EVM = 'EVM',
  SOLANA = 'SOLANA',
}

export enum NetworkId {
  MAINNET = 1,
  POLYGON = 137,
  OPTIMISM = 10,
  ARBITRUM = 42161,
  GNOSIS = 100,
  CELO = 42220,
  BASE = 8453,
  BSC = 56,
  AVALANCHE = 43114,
  SOLANA_MAINNET = 101,
}

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  chainType: ChainType;
  rpcUrl?: string;
  blockExplorerUrl?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isActive?: boolean;
}

/**
 * Chain configuration for external API responses
 * This is the format expected by client services
 */
export interface ChainConfig {
  id: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl: string;
  isActive: boolean;
}

export enum TransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  NOT_FOUND = 'NOT_FOUND',
}

export interface NetworkTransactionInfo {
  hash: string;
  amount: number;
  nonce?: number;
  from: string;
  to: string;
  currency: string;
  timestamp: number;
  status: TransactionStatus;
  blockNumber?: number;
  gasUsed?: string;
  gasPrice?: string;
}

export interface TransactionDetailInput {
  txHash: string;
  symbol: string;
  networkId: number;
  fromAddress: string;
  toAddress: string;
  amount: number;
  timestamp: number;
  safeTxHash?: string;
  nonce?: number;
  chainType?: ChainType;
  isSwap?: boolean;
  importedFromDraftOrBackupService?: boolean;
  tokenAddress?: string | null;
}

export interface TransactionValidationResult {
  isValid: boolean;
  transaction?: NetworkTransactionInfo;
  error?: string;
  errorCode?: string;
}

/**
 * Transaction verification input from external services
 */
export interface TransactionVerificationInput {
  txHash: string;
  networkId: number;
  symbol: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  timestamp: number;
  nonce?: number;
  chainType?: string;
  safeTxHash?: string;
  isSwap?: boolean;
  importedFromDraftOrBackupService?: boolean;
  tokenAddress?: string | null;
}

/**
 * Transaction verification result for external API responses
 * This is the format expected by client services
 */
export interface TransactionVerificationResult {
  status: TransactionStatus;
  transaction?: {
    hash: string;
    from: string;
    to: string;
    amount: number;
    timestamp: number;
  };
  error?: string;
  errorCode?: string;
}

/**
 * Token price request input
 */
export interface TokenPriceInput {
  networkId: number;
  symbol: string;
  tokenAddress?: string | null;
}
