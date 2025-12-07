import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  transactionAmountDelta: parseFloat(
    process.env.TRANSACTION_AMOUNT_DELTA || '0.001',
  ),
  transactionTimeThreshold: parseInt(
    process.env.TRANSACTION_TIME_THRESHOLD || '3600',
    10,
  ),
};

export * from './networks';
export * from './donationHandlers';
