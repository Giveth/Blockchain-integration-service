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
}

export interface TransactionValidationResult {
  isValid: boolean;
  transaction?: NetworkTransactionInfo;
  error?: string;
  errorCode?: string;
}
