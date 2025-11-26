/**
 * Supported blockchain chain types
 */
export enum ChainType {
  EVM = 'EVM',
  SOLANA = 'SOLANA',
  STELLAR = 'STELLAR',
  CARDANO = 'CARDANO',
}

/**
 * Network IDs for supported blockchains
 */
export enum NetworkId {
  // EVM Networks
  MAINNET = 1,
  ROPSTEN = 3,
  RINKEBY = 4,
  GOERLI = 5,
  POLYGON = 137,
  POLYGON_MUMBAI = 80001,
  OPTIMISM = 10,
  OPTIMISM_GOERLI = 420,
  ARBITRUM = 42161,
  ARBITRUM_GOERLI = 421613,
  GNOSIS = 100,
  CELO = 42220,
  CELO_ALFAJORES = 44787,
  BASE = 8453,
  BASE_GOERLI = 84531,
  BSC = 56,
  BSC_TESTNET = 97,
  AVALANCHE = 43114,
  AVALANCHE_FUJI = 43113,

  // Non-EVM Networks
  SOLANA_MAINNET = 101,
  SOLANA_DEVNET = 102,
  SOLANA_TESTNET = 103,
  STELLAR_MAINNET = 200,
  STELLAR_TESTNET = 201,
  CARDANO_MAINNET = 300,
  CARDANO_TESTNET = 301,
}

/**
 * Network configuration
 */
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

/**
 * Transaction status on blockchain
 */
export enum TransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  NOT_FOUND = 'NOT_FOUND',
}

/**
 * Transaction information retrieved from network
 */
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

/**
 * Input parameters for transaction validation
 */
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

/**
 * Validation result for transactions
 */
export interface TransactionValidationResult {
  isValid: boolean;
  transaction?: NetworkTransactionInfo;
  error?: string;
  errorCode?: string;
}

