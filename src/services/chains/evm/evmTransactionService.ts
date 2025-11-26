import { ethers } from 'ethers';
import { logger } from '../../../utils/logger';
import {
  BlockchainError,
  BlockchainErrorCode,
  NetworkTransactionInfo,
  TransactionDetailInput,
  TransactionStatus,
  ChainType,
} from '../../../types';
import { getNetworkConfig, getChainType } from '../../../config';
import { isValidEvmTransactionHash } from '../../../utils/validation';
import { IChainHandler } from '../IChainHandler';

export class EvmTransactionService implements IChainHandler {
  private providers: Map<number, ethers.providers.JsonRpcProvider> = new Map();

  isSupported(networkId: number): boolean {
    try {
      return getChainType(networkId) === ChainType.EVM;
    } catch {
      return false;
    }
  }

  private getProvider(networkId: number): ethers.providers.JsonRpcProvider {
    if (!this.providers.has(networkId)) {
      const networkConfig = getNetworkConfig(networkId);
      if (!networkConfig.rpcUrl) {
        throw new BlockchainError(
          BlockchainErrorCode.INVALID_NETWORK_ID,
          `No RPC URL configured for network ${networkId}`,
          { networkId },
        );
      }
      const provider = new ethers.providers.JsonRpcProvider(
        networkConfig.rpcUrl,
      );
      this.providers.set(networkId, provider);
    }
    return this.providers.get(networkId)!;
  }

  async getTransactionTimestamp(
    txHash: string,
    networkId: number,
  ): Promise<number> {
    try {
      logger.debug('Fetching transaction timestamp', { txHash, networkId });

      const provider = this.getProvider(networkId);
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_NOT_FOUND,
          `Transaction not found: ${txHash}`,
          { txHash, networkId },
        );
      }

      const block = await provider.getBlock(receipt.blockNumber);
      return block.timestamp;
    } catch (error) {
      if (error instanceof BlockchainError) {
        throw error;
      }

      logger.error('Error fetching transaction timestamp', {
        error,
        txHash,
        networkId,
      });

      throw new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        `Failed to fetch transaction timestamp: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { txHash, networkId },
      );
    }
  }

  async isSwapTransactionToAddress(
    networkId: number,
    txHash: string,
    toAddress: string,
  ): Promise<boolean> {
    try {
      const provider = this.getProvider(networkId);
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt || !receipt.logs) {
        logger.debug(
          'No transaction receipt or logs found for swap validation',
          {
            txHash,
            networkId,
          },
        );
        return false;
      }

      const transferEventSignature =
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

      for (const log of receipt.logs) {
        try {
          if (
            log.topics[0] === transferEventSignature &&
            log.topics.length >= 3
          ) {
            const transferToAddress = '0x' + log.topics[2].substring(26);

            if (transferToAddress.toLowerCase() === toAddress.toLowerCase()) {
              logger.debug(
                'Found transfer to target address in swap transaction',
                {
                  txHash,
                  toAddress,
                  transferToAddress,
                },
              );
              return true;
            }
          }
        } catch (error) {
          logger.debug('Error parsing log in swap transaction validation', {
            error: error instanceof Error ? error.message : 'Unknown error',
            log,
          });
          continue;
        }
      }

      logger.debug('No transfer to target address found in swap transaction', {
        txHash,
        toAddress,
      });
      return false;
    } catch (error) {
      logger.error('Error validating swap transaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        txHash,
        networkId,
        toAddress,
      });
      return false;
    }
  }

  async getTransactionInfo(
    input: TransactionDetailInput,
  ): Promise<NetworkTransactionInfo> {
    const { txHash, symbol, networkId, amount } = input;

    logger.debug('Getting EVM transaction info', {
      txHash,
      networkId,
      symbol,
    });

    if (!isValidEvmTransactionHash(txHash)) {
      throw new BlockchainError(
        BlockchainErrorCode.INVALID_TRANSACTION_HASH,
        `Invalid EVM transaction hash format: ${txHash}`,
        { txHash },
      );
    }

    try {
      const provider = this.getProvider(networkId);
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash),
      ]);

      if (!tx) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_NOT_FOUND,
          `Transaction not found: ${txHash}`,
          { txHash, networkId },
        );
      }

      if (receipt && receipt.status === 0) {
        throw new BlockchainError(
          BlockchainErrorCode.TRANSACTION_FAILED,
          `Transaction failed on blockchain: ${txHash}`,
          { txHash, networkId },
        );
      }

      const block = receipt
        ? await provider.getBlock(receipt.blockNumber)
        : null;
      const timestamp = block?.timestamp || Math.floor(Date.now() / 1000);

      let txAmount: number;
      if (symbol.toUpperCase() === 'ETH' || symbol.toUpperCase() === 'MATIC') {
        txAmount = parseFloat(ethers.utils.formatEther(tx.value));
      } else {
        txAmount = amount;
      }

      const transactionInfo: NetworkTransactionInfo = {
        hash: tx.hash,
        amount: txAmount,
        nonce: tx.nonce,
        from: tx.from,
        to: tx.to || '',
        currency: symbol,
        timestamp,
        status: receipt
          ? receipt.status === 1
            ? TransactionStatus.SUCCESS
            : TransactionStatus.FAILED
          : TransactionStatus.PENDING,
        blockNumber: tx.blockNumber || undefined,
        gasUsed: receipt?.gasUsed.toString(),
        gasPrice: tx.gasPrice?.toString(),
      };

      logger.debug('EVM transaction info retrieved', {
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

      logger.error('Error getting EVM transaction info', {
        error,
        txHash,
        networkId,
      });

      throw new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        `Failed to fetch transaction from network: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { txHash, networkId },
      );
    }
  }
}

export const evmTransactionService = new EvmTransactionService();
