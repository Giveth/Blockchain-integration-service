import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { logger } from '../../../utils/logger';
import {
  BlockchainError,
  BlockchainErrorCode,
  NetworkTransactionInfo,
  TransactionDetailInput,
  TransactionStatus,
} from '../../../types';
import { getNetworkConfig } from '../../../config';
import { isValidSolanaSignature } from '../../../utils/validation';

/**
 * Service for handling Solana blockchain transactions
 */
export class SolanaTransactionService {
  private connections: Map<number, Connection> = new Map();

  /**
   * Get or create connection for a network
   */
  private getConnection(networkId: number): Connection {
    if (!this.connections.has(networkId)) {
      const networkConfig = getNetworkConfig(networkId);
      if (!networkConfig.rpcUrl) {
        throw new BlockchainError(
          BlockchainErrorCode.INVALID_NETWORK_ID,
          `No RPC URL configured for Solana network ${networkId}`,
          { networkId },
        );
      }
      const connection = new Connection(networkConfig.rpcUrl, 'confirmed');
      this.connections.set(networkId, connection);
    }
    return this.connections.get(networkId)!;
  }

  /**
   * Get transaction information from Solana network
   */
  async getTransactionInfo(
    input: TransactionDetailInput,
  ): Promise<NetworkTransactionInfo> {
    const { txHash, symbol, networkId, fromAddress, toAddress } = input;

    logger.debug('Getting Solana transaction info', {
      txHash,
      networkId,
      symbol,
    });

    // Validate signature format
    if (!isValidSolanaSignature(txHash)) {
      throw new BlockchainError(
        BlockchainErrorCode.INVALID_TRANSACTION_HASH,
        `Invalid Solana signature format: ${txHash}`,
        { txHash },
      );
    }

    try {
      const connection = this.getConnection(networkId);

      // Fetch transaction
      const transaction = await connection.getParsedTransaction(txHash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!transaction) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_NOT_FOUND,
          `Transaction not found: ${txHash}`,
          { txHash, networkId },
        );
      }

      // Check transaction status
      if (transaction.meta?.err) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_FAILED,
          `Transaction failed on Solana: ${JSON.stringify(transaction.meta.err)}`,
          { txHash, networkId, error: transaction.meta.err },
        );
      }

      // Get timestamp from block
      const timestamp = transaction.blockTime || Math.floor(Date.now() / 1000);

      // Parse amount from transaction
      let amount = 0;
      if (symbol.toUpperCase() === 'SOL') {
        // Native SOL transfer
        const preBalances = transaction.meta?.preBalances || [];
        const postBalances = transaction.meta?.postBalances || [];

        // Find the difference for the recipient
        const fromPubkey = new PublicKey(fromAddress);
        const toPubkey = new PublicKey(toAddress);

        const accountKeys =
          transaction.transaction.message.accountKeys.map((key) =>
            typeof key === 'string' ? key : key.pubkey.toString(),
          );

        const fromIndex = accountKeys.findIndex(
          (key) => key === fromPubkey.toString(),
        );
        const toIndex = accountKeys.findIndex(
          (key) => key === toPubkey.toString(),
        );

        if (fromIndex !== -1 && toIndex !== -1) {
          const preBalance = preBalances[toIndex] || 0;
          const postBalance = postBalances[toIndex] || 0;
          amount = (postBalance - preBalance) / LAMPORTS_PER_SOL;
        }
      } else {
        // SPL token transfer
        // Parse from token balances
        const preTokenBalances = transaction.meta?.preTokenBalances || [];
        const postTokenBalances = transaction.meta?.postTokenBalances || [];

        for (const postBalance of postTokenBalances) {
          const preBalance = preTokenBalances.find(
            (pre) => pre.accountIndex === postBalance.accountIndex,
          );

          if (
            postBalance.owner === toAddress &&
            postBalance.mint // This would be the token mint address
          ) {
            const preAmount = parseFloat(
              preBalance?.uiTokenAmount?.uiAmount?.toString() || '0',
            );
            const postAmount = parseFloat(
              postBalance.uiTokenAmount?.uiAmount?.toString() || '0',
            );
            amount = postAmount - preAmount;
            break;
          }
        }
      }

      const transactionInfo: NetworkTransactionInfo = {
        hash: txHash,
        amount,
        from: fromAddress,
        to: toAddress,
        currency: symbol,
        timestamp,
        status: transaction.meta?.err
          ? TransactionStatus.FAILED
          : TransactionStatus.SUCCESS,
        blockNumber: transaction.slot,
      };

      logger.debug('Solana transaction info retrieved', {
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

      logger.error('Error getting Solana transaction info', {
        error,
        txHash,
        networkId,
      });

      throw new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        `Failed to fetch Solana transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { txHash, networkId },
      );
    }
  }
}

// Export singleton instance
export const solanaTransactionService = new SolanaTransactionService();

