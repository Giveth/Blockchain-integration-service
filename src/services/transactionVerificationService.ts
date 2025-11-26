import {
  TransactionDetailInput,
  NetworkTransactionInfo,
  TransactionValidationResult,
  BlockchainError,
  BlockchainErrorCode,
} from '../types';
import { getTransactionInfoFromNetwork } from './chains';
import { safeTransactionService } from './safe';
import { logger } from '../utils/logger';
import {
  closeTo,
  isTimestampValid,
  normalizeAddress,
} from '../utils/validation';
import { config } from '../config';
import { evmTransactionService } from './chains/evm/evmTransactionService';

export class TransactionVerificationService {
  private async validateTransaction(
    transaction: NetworkTransactionInfo,
    input: TransactionDetailInput,
  ): Promise<void> {
    logger.debug('Validating transaction', {
      txHash: transaction.hash,
      expectedFrom: input.fromAddress,
      expectedTo: input.toAddress,
      expectedAmount: input.amount,
    });

    // For swap transactions, use special validation
    if (input.isSwap) {
      const isValidSwap =
        await evmTransactionService.isSwapTransactionToAddress(
          input.networkId,
          input.txHash,
          input.toAddress,
        );

      if (!isValidSwap) {
        throw new BlockchainError(
          BlockchainErrorCode.SWAP_VALIDATION_FAILED,
          'Swap transaction does not transfer to the expected address',
          {
            txHash: transaction.hash,
            expectedTo: input.toAddress,
          },
        );
      }

      logger.debug('Swap transaction validated successfully');
      return;
    }

    if (
      normalizeAddress(transaction.to) !== normalizeAddress(input.toAddress)
    ) {
      throw new BlockchainError(
        BlockchainErrorCode.TO_ADDRESS_MISMATCH,
        'Transaction recipient address does not match expected address',
        {
          txHash: transaction.hash,
          expected: input.toAddress,
          actual: transaction.to,
        },
      );
    }

    if (
      normalizeAddress(transaction.from) !== normalizeAddress(input.fromAddress)
    ) {
      throw new BlockchainError(
        BlockchainErrorCode.FROM_ADDRESS_MISMATCH,
        'Transaction sender address does not match expected address',
        {
          txHash: transaction.hash,
          expected: input.fromAddress,
          actual: transaction.from,
        },
      );
    }

    if (
      !closeTo(transaction.amount, input.amount, config.transactionAmountDelta)
    ) {
      throw new BlockchainError(
        BlockchainErrorCode.AMOUNT_MISMATCH,
        'Transaction amount does not match expected amount',
        {
          txHash: transaction.hash,
          expected: input.amount,
          actual: transaction.amount,
          delta: config.transactionAmountDelta,
        },
      );
    }

    if (!input.importedFromDraftOrBackupService) {
      if (
        !isTimestampValid(
          transaction.timestamp,
          input.timestamp,
          config.transactionTimeThreshold,
        )
      ) {
        throw new BlockchainError(
          BlockchainErrorCode.TIMESTAMP_TOO_OLD,
          'Transaction timestamp is too old compared to donation timestamp',
          {
            txHash: transaction.hash,
            transactionTimestamp: transaction.timestamp,
            donationTimestamp: input.timestamp,
            threshold: config.transactionTimeThreshold,
          },
        );
      }
    }

    logger.debug('Transaction validation successful', {
      txHash: transaction.hash,
    });
  }

  async verifyTransaction(
    input: TransactionDetailInput,
  ): Promise<TransactionValidationResult> {
    logger.info('Starting transaction verification', {
      txHash: input.txHash,
      networkId: input.networkId,
      symbol: input.symbol,
    });

    try {
      if (input.safeTxHash && !input.txHash) {
        logger.debug('Fetching Safe transaction hash', {
          safeTxHash: input.safeTxHash,
        });

        const safeHash = await safeTransactionService.fetchSafeTransactionHash(
          input.safeTxHash,
          input.networkId,
        );

        if (!safeHash) {
          throw new BlockchainError(
            BlockchainErrorCode.SAFE_TRANSACTION_NOT_FOUND,
            'Safe transaction has not been executed yet',
            {
              safeTxHash: input.safeTxHash,
              networkId: input.networkId,
            },
          );
        }

        input.txHash = safeHash;
      }

      const transaction = await getTransactionInfoFromNetwork(input);
      await this.validateTransaction(transaction, input);

      logger.info('Transaction verification successful', {
        txHash: transaction.hash,
        from: transaction.from,
        to: transaction.to,
        amount: transaction.amount,
      });

      return {
        isValid: true,
        transaction,
      };
    } catch (error) {
      if (error instanceof BlockchainError) {
        logger.warn('Transaction verification failed', {
          txHash: input.txHash,
          error: error.message,
          code: error.code,
          details: error.details,
        });

        return {
          isValid: false,
          error: error.message,
          errorCode: error.code,
        };
      }

      logger.error('Unexpected error during transaction verification', {
        error,
        txHash: input.txHash,
      });

      return {
        isValid: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during verification',
        errorCode: BlockchainErrorCode.NETWORK_ERROR,
      };
    }
  }

  async verifyTransactions(
    inputs: TransactionDetailInput[],
  ): Promise<TransactionValidationResult[]> {
    logger.info('Starting batch transaction verification', {
      count: inputs.length,
    });

    const results = await Promise.all(
      inputs.map((input) => this.verifyTransaction(input)),
    );

    const successCount = results.filter((r) => r.isValid).length;
    logger.info('Batch transaction verification completed', {
      total: inputs.length,
      successful: successCount,
      failed: inputs.length - successCount,
    });

    return results;
  }

  async getTransactionTimestamp(
    txHash: string,
    networkId: number,
  ): Promise<number> {
    logger.debug('Fetching transaction timestamp', { txHash, networkId });

    try {
      const transaction = await getTransactionInfoFromNetwork({
        txHash,
        networkId,
        symbol: '',
        fromAddress: '',
        toAddress: '',
        amount: 0,
        timestamp: 0,
      });

      return transaction.timestamp;
    } catch (error) {
      logger.error('Error fetching transaction timestamp', {
        error,
        txHash,
        networkId,
      });
      throw error;
    }
  }
}

export const transactionVerificationService =
  new TransactionVerificationService();
