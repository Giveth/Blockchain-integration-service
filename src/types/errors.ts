/**
 * Custom error codes for blockchain integration service
 */
export enum BlockchainErrorCode {
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INVALID_NETWORK_ID = 'INVALID_NETWORK_ID',
  INVALID_TRANSACTION_HASH = 'INVALID_TRANSACTION_HASH',
  FROM_ADDRESS_MISMATCH = 'FROM_ADDRESS_MISMATCH',
  TO_ADDRESS_MISMATCH = 'TO_ADDRESS_MISMATCH',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  TIMESTAMP_TOO_OLD = 'TIMESTAMP_TOO_OLD',
  NONCE_ALREADY_USED = 'NONCE_ALREADY_USED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  SWAP_VALIDATION_FAILED = 'SWAP_VALIDATION_FAILED',
  SAFE_TRANSACTION_NOT_FOUND = 'SAFE_TRANSACTION_NOT_FOUND',
  UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN',
  SMART_CONTRACT_CONFLICT = 'SMART_CONTRACT_CONFLICT',
}

/**
 * Custom error class for blockchain integration
 */
export class BlockchainError extends Error {
  code: BlockchainErrorCode;
  details?: Record<string, unknown>;

  constructor(
    code: BlockchainErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BlockchainError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

