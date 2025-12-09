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
import { isDonationHandlerAddress } from '../../../config/donationHandlers';
import { isValidEvmTransactionHash } from '../../../utils/validation';
import { IChainHandler } from '../IChainHandler';

// ERC-20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_SIGNATURE =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// DonationMade event signature from DonationHandler contract
// DonationMade(address indexed recipientAddress, uint256 amount, address indexed tokenAddress, bytes data)
// keccak256("DonationMade(address,uint256,address,bytes)")
const DONATION_MADE_EVENT_SIGNATURE =
  '0x428e1190dfef997f3ac8da6afa80e330fc785bafb1febed9109598bfeee45ec0';

// Native token address (used in DonationMade events for ETH/MATIC donations)
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface DonationTransferInfo {
  from: string;
  to: string;
  amount: bigint;
  tokenAddress: string;
  isNativeToken?: boolean;
}

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

  /**
   * Parse Transfer events from transaction logs
   * Returns all ERC-20 transfers found in the transaction
   */
  private parseTransferEvents(
    logs: ethers.providers.Log[],
  ): DonationTransferInfo[] {
    const transfers: DonationTransferInfo[] = [];

    for (const log of logs) {
      try {
        if (
          log.topics[0] === TRANSFER_EVENT_SIGNATURE &&
          log.topics.length >= 3
        ) {
          // Decode Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
          const from = '0x' + log.topics[1].substring(26);
          const to = '0x' + log.topics[2].substring(26);
          const amount = ethers.BigNumber.from(log.data).toBigInt();

          transfers.push({
            from,
            to,
            amount,
            tokenAddress: log.address,
            isNativeToken: false,
          });
        }
      } catch (error) {
        logger.debug('Error parsing transfer event', {
          error: error instanceof Error ? error.message : 'Unknown error',
          log,
        });
        continue;
      }
    }

    return transfers;
  }

  /**
   * Parse DonationMade events from transaction logs
   * Used for both ERC-20 and native token donations through donation handler
   * Event: DonationMade(address indexed recipientAddress, uint256 amount, address indexed tokenAddress, bytes data)
   */
  private parseDonationMadeEvents(
    logs: ethers.providers.Log[],
    txFrom: string,
  ): DonationTransferInfo[] {
    const donations: DonationTransferInfo[] = [];

    for (const log of logs) {
      try {
        if (
          log.topics[0] === DONATION_MADE_EVENT_SIGNATURE &&
          log.topics.length >= 3
        ) {
          // Decode DonationMade event
          // topic[1] = recipientAddress (indexed)
          // topic[2] = tokenAddress (indexed)
          // data = amount (uint256) + data (bytes)
          const to = '0x' + log.topics[1].substring(26);
          const tokenAddress = '0x' + log.topics[2].substring(26);

          // Decode non-indexed parameters from data
          // First 32 bytes = amount, rest is dynamic bytes data
          const amount = ethers.BigNumber.from(
            '0x' + log.data.substring(2, 66),
          ).toBigInt();

          const isNativeToken =
            tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

          donations.push({
            from: txFrom, // The original transaction sender
            to,
            amount,
            tokenAddress: isNativeToken ? NATIVE_TOKEN_ADDRESS : tokenAddress,
            isNativeToken,
          });
        }
      } catch (error) {
        logger.debug('Error parsing DonationMade event', {
          error: error instanceof Error ? error.message : 'Unknown error',
          log,
        });
        continue;
      }
    }

    return donations;
  }

  /**
   * Find a specific donation transfer to a recipient address
   * Used when verifying donations through donation handler contracts
   */
  findDonationTransfer(
    transfers: DonationTransferInfo[],
    toAddress: string,
    expectedAmount?: number,
    tokenDecimals: number = 18,
  ): DonationTransferInfo | null {
    const normalizedToAddress = toAddress.toLowerCase();

    // Filter transfers to the target recipient
    const matchingTransfers = transfers.filter(
      (t) => t.to.toLowerCase() === normalizedToAddress,
    );

    if (matchingTransfers.length === 0) {
      return null;
    }

    // If only one transfer to this recipient, return it
    if (matchingTransfers.length === 1) {
      return matchingTransfers[0];
    }

    // If multiple transfers and we have an expected amount, find the closest match
    if (expectedAmount !== undefined) {
      const expectedAmountBigInt = BigInt(
        Math.floor(expectedAmount * 10 ** tokenDecimals),
      );

      // Find transfer with closest amount (within 1% tolerance)
      const tolerance = expectedAmountBigInt / BigInt(100); // 1% tolerance

      for (const transfer of matchingTransfers) {
        const diff =
          transfer.amount > expectedAmountBigInt
            ? transfer.amount - expectedAmountBigInt
            : expectedAmountBigInt - transfer.amount;

        if (diff <= tolerance) {
          return transfer;
        }
      }
    }

    // Return the first matching transfer if no exact match found
    return matchingTransfers[0];
  }

  /**
   * Check if a symbol represents the native currency of a network
   * Handles both old (MATIC) and new (POL) naming for Polygon
   */
  private isNativeCurrencySymbol(networkId: number, symbol: string): boolean {
    const networkConfig = getNetworkConfig(networkId);
    const nativeSymbol = networkConfig.nativeCurrency?.symbol?.toUpperCase();
    const upperSymbol = symbol.toUpperCase();

    // Direct match
    if (upperSymbol === nativeSymbol) {
      return true;
    }

    // Handle Polygon's MATIC/POL naming (both refer to native token)
    if (networkId === 137) {
      return upperSymbol === 'MATIC' || upperSymbol === 'POL';
    }

    return false;
  }

  /**
   * Get transaction info for a donation handler transaction
   * Parses the logs to find the specific transfer to the recipient
   * Supports both ERC-20 donations (donateManyERC20) and native token donations (donateManyEth)
   */
  async getDonationHandlerTransactionInfo(
    input: TransactionDetailInput,
  ): Promise<NetworkTransactionInfo> {
    const { txHash, networkId, toAddress, amount, symbol } = input;

    logger.debug('Getting donation handler transaction info', {
      txHash,
      networkId,
      toAddress,
      symbol,
    });

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

    if (!receipt) {
      throw new BlockchainError(
        BlockchainErrorCode.TRANSACTION_NOT_FOUND,
        `Transaction receipt not found: ${txHash}`,
        { txHash, networkId },
      );
    }

    if (receipt.status === 0) {
      throw new BlockchainError(
        BlockchainErrorCode.TRANSACTION_FAILED,
        `Transaction failed on blockchain: ${txHash}`,
        { txHash, networkId },
      );
    }

    // Determine if the expected token is native currency
    const expectsNativeToken = this.isNativeCurrencySymbol(networkId, symbol);

    logger.debug('Token type expectation', {
      txHash,
      symbol,
      expectsNativeToken,
    });

    let donationTransfer: DonationTransferInfo | null = null;

    // Parse all DonationMade events
    const allDonations = this.parseDonationMadeEvents(receipt.logs, tx.from);

    logger.debug('Parsed DonationMade events from donation handler', {
      txHash,
      donationCount: allDonations.length,
      toAddress,
      nativeDonationCount: allDonations.filter((d) => d.isNativeToken).length,
      erc20DonationCount: allDonations.filter((d) => !d.isNativeToken).length,
    });

    if (expectsNativeToken) {
      // User expects native token - ONLY accept native token donations
      const nativeDonations = allDonations.filter((d) => d.isNativeToken);
      donationTransfer = this.findDonationTransfer(
        nativeDonations,
        toAddress,
        amount,
      );

      if (!donationTransfer) {
        throw new BlockchainError(
          BlockchainErrorCode.TO_ADDRESS_MISMATCH,
          `No native token (${symbol}) transfer found to recipient ${toAddress} in donation handler transaction. The transaction may contain ERC-20 transfers instead.`,
          {
            txHash,
            networkId,
            expectedTo: toAddress,
            expectedToken: symbol,
            expectedTokenType: 'native',
          },
        );
      }
    } else {
      // User expects ERC-20 token - look for ERC-20 transfers
      // First try DonationMade events for ERC-20 tokens
      const erc20Donations = allDonations.filter((d) => !d.isNativeToken);
      donationTransfer = this.findDonationTransfer(
        erc20Donations,
        toAddress,
        amount,
      );

      // If not found in DonationMade events, try Transfer events
      if (!donationTransfer) {
        const transfers = this.parseTransferEvents(receipt.logs);

        logger.debug('Parsed Transfer events from donation handler', {
          txHash,
          transferCount: transfers.length,
          toAddress,
        });

        donationTransfer = this.findDonationTransfer(
          transfers,
          toAddress,
          amount,
        );
      }

      if (!donationTransfer) {
        throw new BlockchainError(
          BlockchainErrorCode.TO_ADDRESS_MISMATCH,
          `No ERC-20 token transfer found to recipient ${toAddress} in donation handler transaction`,
          {
            txHash,
            networkId,
            expectedTo: toAddress,
            expectedToken: symbol,
            expectedTokenType: 'ERC-20',
          },
        );
      }
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const timestamp = block?.timestamp || Math.floor(Date.now() / 1000);

    // Convert amount from BigInt to number (assuming 18 decimals for most tokens)
    const tokenDecimals = 18; // TODO: Could fetch from token contract if needed
    const transferAmount =
      Number(donationTransfer.amount) / 10 ** tokenDecimals;

    // Determine the currency symbol
    // For native tokens, use the network's native currency (ETH, MATIC, etc.)
    let currency = symbol;
    if (donationTransfer.isNativeToken) {
      const networkConfig = getNetworkConfig(networkId);
      currency = networkConfig.nativeCurrency?.symbol || symbol;
    }

    const transactionInfo: NetworkTransactionInfo = {
      hash: tx.hash,
      amount: transferAmount,
      nonce: tx.nonce,
      from: donationTransfer.from, // The actual sender of this specific transfer
      to: donationTransfer.to, // The recipient of this specific transfer
      currency,
      timestamp,
      status: TransactionStatus.SUCCESS,
      blockNumber: tx.blockNumber || undefined,
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: tx.gasPrice?.toString(),
    };

    logger.debug('Donation handler transaction info retrieved', {
      hash: transactionInfo.hash,
      from: transactionInfo.from,
      to: transactionInfo.to,
      amount: transactionInfo.amount,
      tokenAddress: donationTransfer.tokenAddress,
      isNativeToken: donationTransfer.isNativeToken,
    });

    return transactionInfo;
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

      const transfers = this.parseTransferEvents(receipt.logs);
      const hasTransferToAddress = transfers.some(
        (t) => t.to.toLowerCase() === toAddress.toLowerCase(),
      );

      if (hasTransferToAddress) {
        logger.debug('Found transfer to target address in swap transaction', {
          txHash,
          toAddress,
        });
      } else {
        logger.debug(
          'No transfer to target address found in swap transaction',
          {
            txHash,
            toAddress,
          },
        );
      }

      return hasTransferToAddress;
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

      // Check if this transaction is to a donation handler contract
      if (tx.to && isDonationHandlerAddress(networkId, tx.to)) {
        logger.debug('Transaction is to a donation handler contract', {
          txHash,
          donationHandler: tx.to,
        });
        return this.getDonationHandlerTransactionInfo(input);
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
