/**
 * Blockchain Integration Service
 * 
 * A comprehensive service for blockchain transaction verification and multi-chain support
 * 
 * @packageDocumentation
 */

// Export main services
export * from './services';

// Export types
export * from './types';

// Export utilities
export * from './utils';

// Export configuration
export * from './config';

// Export main transaction verification service as default
export { transactionVerificationService as default } from './services/transactionVerificationService';

