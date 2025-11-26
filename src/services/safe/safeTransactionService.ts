import SafeApiKit from '@safe-global/api-kit';
import { logger } from '../../utils/logger';
import { BlockchainError, BlockchainErrorCode } from '../../types/errors';

/**
 * Service for interacting with Safe (Gnosis Safe) multisig transactions
 */
export class SafeTransactionService {
  /**
   * Fetch the actual transaction hash from a Safe multisig transaction
   * @param safeMessageHash The Safe transaction hash
   * @param networkId The network ID where the Safe is deployed
   * @returns The actual transaction hash or null if not found
   */
  async fetchSafeTransactionHash(
    safeMessageHash: string,
    networkId: number,
  ): Promise<string | null> {
    try {
      logger.debug('Fetching Safe transaction hash', {
        safeMessageHash,
        networkId,
      });

      const safeService = new SafeApiKit({
        chainId: BigInt(networkId),
      });

      const tx = await safeService.getTransaction(safeMessageHash);
      const transactionHash = tx?.transactionHash || null;

      if (transactionHash) {
        logger.info('Safe transaction hash found', {
          safeMessageHash,
          transactionHash,
        });
      } else {
        logger.warn('Safe transaction not executed yet', {
          safeMessageHash,
        });
      }

      return transactionHash;
    } catch (error) {
      logger.error('Error fetching Safe transaction hash', {
        error,
        safeMessageHash,
        networkId,
      });

      throw new BlockchainError(
        BlockchainErrorCode.SAFE_TRANSACTION_NOT_FOUND,
        `Failed to fetch Safe transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          safeMessageHash,
          networkId,
        },
      );
    }
  }

  /**
   * Check if a Safe transaction has been executed
   * @param safeMessageHash The Safe transaction hash
   * @param networkId The network ID where the Safe is deployed
   * @returns true if the transaction has been executed
   */
  async isSafeTransactionExecuted(
    safeMessageHash: string,
    networkId: number,
  ): Promise<boolean> {
    try {
      const transactionHash = await this.fetchSafeTransactionHash(
        safeMessageHash,
        networkId,
      );
      return transactionHash !== null;
    } catch (error) {
      logger.error('Error checking Safe transaction execution status', {
        error,
        safeMessageHash,
        networkId,
      });
      return false;
    }
  }

  /**
   * Get Safe transaction details
   * @param safeMessageHash The Safe transaction hash
   * @param networkId The network ID where the Safe is deployed
   * @returns Safe transaction details
   */
  async getSafeTransactionDetails(
    safeMessageHash: string,
    networkId: number,
  ): Promise<Record<string, unknown>> {
    try {
      logger.debug('Fetching Safe transaction details', {
        safeMessageHash,
        networkId,
      });

      const safeService = new SafeApiKit({
        chainId: BigInt(networkId),
      });

      const tx = await safeService.getTransaction(safeMessageHash);

      return {
        safe: tx.safe,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        operation: tx.operation,
        safeTxGas: tx.safeTxGas,
        baseGas: tx.baseGas,
        gasPrice: tx.gasPrice,
        gasToken: tx.gasToken,
        refundReceiver: tx.refundReceiver,
        nonce: tx.nonce,
        executionDate: tx.executionDate,
        submissionDate: tx.submissionDate,
        modified: tx.modified,
        blockNumber: tx.blockNumber,
        transactionHash: tx.transactionHash,
        safeTxHash: tx.safeTxHash,
        executor: tx.executor,
        isExecuted: tx.isExecuted,
        isSuccessful: tx.isSuccessful,
        confirmationsRequired: tx.confirmationsRequired,
        confirmations: tx.confirmations,
      };
    } catch (error) {
      logger.error('Error fetching Safe transaction details', {
        error,
        safeMessageHash,
        networkId,
      });

      throw new BlockchainError(
        BlockchainErrorCode.SAFE_TRANSACTION_NOT_FOUND,
        `Failed to fetch Safe transaction details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          safeMessageHash,
          networkId,
        },
      );
    }
  }
}

// Export singleton instance
export const safeTransactionService = new SafeTransactionService();

