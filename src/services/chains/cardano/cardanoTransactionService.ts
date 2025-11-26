import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { logger } from '../../../utils/logger';
import {
  BlockchainError,
  BlockchainErrorCode,
  NetworkTransactionInfo,
  TransactionDetailInput,
  TransactionStatus,
} from '../../../types';
import { config } from '../../../config';

/**
 * Service for handling Cardano blockchain transactions
 */
export class CardanoTransactionService {
  private api: BlockFrostAPI | null = null;

  /**
   * Get or create Blockfrost API instance
   */
  private getApi(): BlockFrostAPI {
    if (!this.api) {
      if (!config.blockfrostProjectId) {
        throw new BlockchainError(
          BlockchainErrorCode.PROVIDER_ERROR,
          'Blockfrost project ID not configured',
        );
      }

      this.api = new BlockFrostAPI({
        projectId: config.blockfrostProjectId,
        network: config.cardanoNetwork as 'mainnet' | 'testnet',
      });
    }
    return this.api;
  }

  /**
   * Convert lovelace to ADA
   */
  private lovelaceToAda(lovelace: string): number {
    return parseInt(lovelace, 10) / 1_000_000;
  }

  /**
   * Get transaction information from Cardano network
   */
  async getTransactionInfo(
    input: TransactionDetailInput,
  ): Promise<NetworkTransactionInfo> {
    const { txHash, symbol, networkId, fromAddress, toAddress } = input;

    logger.debug('Getting Cardano transaction info', {
      txHash,
      networkId,
      symbol,
    });

    try {
      const api = this.getApi();

      // Fetch transaction details
      const [tx, utxos] = await Promise.all([
        api.txs(txHash),
        api.txsUtxos(txHash),
      ]);

      if (!tx) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_NOT_FOUND,
          `Transaction not found: ${txHash}`,
          { txHash, networkId },
        );
      }

      // Check if transaction was successful
      // In Cardano, if we can fetch the tx, it's confirmed and successful
      // Failed transactions don't get added to the blockchain

      // Find the output to the recipient address and calculate amount
      let amount = 0;
      let actualTo = toAddress;

      for (const output of utxos.outputs) {
        if (output.address === toAddress) {
          actualTo = output.address;

          // Find ADA amount
          const adaAmount = output.amount.find(
            (a) => a.unit === 'lovelace',
          );
          if (adaAmount && symbol.toUpperCase() === 'ADA') {
            amount = this.lovelaceToAda(adaAmount.quantity);
          } else {
            // Look for specific token
            const tokenAmount = output.amount.find(
              (a) => a.unit !== 'lovelace',
            );
            if (tokenAmount) {
              // Token amounts in Cardano need proper decimals handling
              // This is simplified - in production, you'd need to query token metadata
              amount = parseInt(tokenAmount.quantity, 10);
            }
          }
          break;
        }
      }

      // Try to find sender address from inputs
      let actualFrom = fromAddress;
      if (utxos.inputs.length > 0) {
        actualFrom = utxos.inputs[0].address;
      }

      // Get timestamp from block
      const timestamp = tx.block_time;

      const transactionInfo: NetworkTransactionInfo = {
        hash: txHash,
        amount,
        from: actualFrom,
        to: actualTo,
        currency: symbol,
        timestamp,
        status: TransactionStatus.SUCCESS,
        blockNumber: tx.block_height,
      };

      logger.debug('Cardano transaction info retrieved', {
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

      // Check for 404 error from Blockfrost
      if (
        error &&
        typeof error === 'object' &&
        'status_code' in error &&
        error.status_code === 404
      ) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_NOT_FOUND,
          `Transaction not found on Cardano: ${txHash}`,
          { txHash, networkId },
        );
      }

      logger.error('Error getting Cardano transaction info', {
        error,
        txHash,
        networkId,
      });

      throw new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        `Failed to fetch Cardano transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { txHash, networkId },
      );
    }
  }
}

// Export singleton instance
export const cardanoTransactionService = new CardanoTransactionService();

