import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Service configuration
 */
export const config = {
  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',

  // Validation settings
  transactionAmountDelta:
    parseFloat(process.env.TRANSACTION_AMOUNT_DELTA || '0.001'),
  transactionTimeThreshold:
    parseInt(process.env.TRANSACTION_TIME_THRESHOLD || '3600', 10),

  // Cardano
  blockfrostProjectId: process.env.BLOCKFROST_PROJECT_ID,
  cardanoNetwork: process.env.CARDANO_NETWORK || 'mainnet',

  // Solana
  solanaChainId: parseInt(process.env.SOLANA_CHAIN_ID || '101', 10),

  // Stellar
  stellarNetworkPassphrase:
    process.env.STELLAR_NETWORK_PASSPHRASE ||
    'Public Global Stellar Network ; September 2015',
};

export * from './networks';

