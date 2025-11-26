import * as StellarSdk from '@stellar/stellar-sdk';
import { logger } from '../../../utils/logger';
import {
  BlockchainError,
  BlockchainErrorCode,
  NetworkTransactionInfo,
  TransactionDetailInput,
  TransactionStatus,
} from '../../../types';
import { getNetworkConfig } from '../../../config';
import { config } from '../../../config';

/**
 * Service for handling Stellar blockchain transactions
 */
export class StellarTransactionService {
  private servers: Map<number, StellarSdk.Horizon.Server> = new Map();

  /**
   * Get or create Horizon server for a network
   */
  private getServer(networkId: number): StellarSdk.Horizon.Server {
    if (!this.servers.has(networkId)) {
      const networkConfig = getNetworkConfig(networkId);
      if (!networkConfig.rpcUrl) {
        throw new BlockchainError(
          BlockchainErrorCode.INVALID_NETWORK_ID,
          `No RPC URL configured for Stellar network ${networkId}`,
          { networkId },
        );
      }
      const server = new StellarSdk.Horizon.Server(networkConfig.rpcUrl);
      this.servers.set(networkId, server);
    }
    return this.servers.get(networkId)!;
  }

  /**
   * Get transaction information from Stellar network
   */
  async getTransactionInfo(
    input: TransactionDetailInput,
  ): Promise<NetworkTransactionInfo> {
    const { txHash, symbol, networkId, fromAddress, toAddress } = input;

    logger.debug('Getting Stellar transaction info', {
      txHash,
      networkId,
      symbol,
    });

    try {
      const server = this.getServer(networkId);

      // Fetch transaction
      const transaction = await server.transactions().transaction(txHash).call();

      if (!transaction) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_NOT_FOUND,
          `Transaction not found: ${txHash}`,
          { txHash, networkId },
        );
      }

      // Check if transaction was successful
      if (!transaction.successful) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_FAILED,
          `Transaction failed on Stellar: ${txHash}`,
          { txHash, networkId },
        );
      }

      // Get operations to find payment details
      const operations = await transaction.operations();
      let amount = 0;
      let actualFrom = fromAddress;
      let actualTo = toAddress;

      // Look for payment or path_payment operations
      for (const operation of operations.records) {
        if (
          operation.type === 'payment' &&
          'from' in operation &&
          'to' in operation
        ) {
          const paymentOp = operation as StellarSdk.Horizon.ServerApi.PaymentOperationRecord;
          if (
            paymentOp.from === fromAddress &&
            paymentOp.to === toAddress &&
            paymentOp.asset_type !== 'native'
              ? paymentOp.asset_code === symbol
              : symbol.toUpperCase() === 'XLM'
          ) {
            amount = parseFloat(paymentOp.amount);
            actualFrom = paymentOp.from;
            actualTo = paymentOp.to;
            break;
          }
        } else if (
          operation.type === 'path_payment_strict_receive' &&
          'from' in operation &&
          'to' in operation
        ) {
          const pathPaymentOp = operation as StellarSdk.Horizon.ServerApi.PathPaymentStrictReceiveOperationRecord;
          if (
            pathPaymentOp.from === fromAddress &&
            pathPaymentOp.to === toAddress
          ) {
            amount = parseFloat(pathPaymentOp.amount);
            actualFrom = pathPaymentOp.from;
            actualTo = pathPaymentOp.to;
            break;
          }
        } else if (
          operation.type === 'path_payment_strict_send' &&
          'from' in operation &&
          'to' in operation
        ) {
          const pathPaymentOp = operation as StellarSdk.Horizon.ServerApi.PathPaymentStrictSendOperationRecord;
          if (
            pathPaymentOp.from === fromAddress &&
            pathPaymentOp.to === toAddress
          ) {
            amount = parseFloat(pathPaymentOp.destination_amount);
            actualFrom = pathPaymentOp.from;
            actualTo = pathPaymentOp.to;
            break;
          }
        }
      }

      // Parse timestamp
      const timestamp = new Date(transaction.created_at).getTime() / 1000;

      const transactionInfo: NetworkTransactionInfo = {
        hash: txHash,
        amount,
        from: actualFrom,
        to: actualTo,
        currency: symbol,
        timestamp,
        status: transaction.successful
          ? TransactionStatus.SUCCESS
          : TransactionStatus.FAILED,
      };

      logger.debug('Stellar transaction info retrieved', {
        hash: transactionInfo.hash,
        from: transactionInfo.from,
        to: transactionInfo.to,
        amount: transactionInfo.amount,
        status: transactionInfo.status,
      });

      return transactionInfo;
    } catch (error) {
      if (error instanceof BlockchainError) {
        throw error;
      }

      // Check if it's a 404 error from Stellar
      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'status' in error.response &&
        error.response.status === 404
      ) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_NOT_FOUND,
          `Transaction not found on Stellar: ${txHash}`,
          { txHash, networkId },
        );
      }

      logger.error('Error getting Stellar transaction info', {
        error,
        txHash,
        networkId,
      });

      throw new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        `Failed to fetch Stellar transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { txHash, networkId },
      );
    }
  }
}

// Export singleton instance
export const stellarTransactionService = new StellarTransactionService();

