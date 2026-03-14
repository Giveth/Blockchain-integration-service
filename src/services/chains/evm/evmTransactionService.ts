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
import {
  getDonationHandlerAddresses,
  isDonationHandlerAddress,
} from '../../../config/donationHandlers';
import {
  closeTo,
  isValidEvmTransactionHash,
  normalizeAddress,
} from '../../../utils/validation';
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

// EIP-4337 EntryPoint contracts (v0.6 + v0.7)
const ERC4337_ENTRYPOINT_ADDRESSES = new Set<string>([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
]);

// Minimal ERC-20 ABI for symbol() function
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

interface InternalValueTransfer {
  from: string;
  to: string;
  value: bigint;
}

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

  /**
   * Fetch the symbol of an ERC-20 token from the blockchain
   */
  async getTokenSymbol(
    networkId: number,
    tokenAddress: string,
  ): Promise<string | null> {
    try {
      const provider = this.getProvider(networkId);
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const symbol = await contract.symbol();
      return symbol;
    } catch (error) {
      logger.warn('Failed to fetch token symbol', {
        tokenAddress,
        networkId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Fetch token decimals from an ERC-20 contract.
   * Falls back to 18 when the contract call fails.
   */
  async getTokenDecimals(
    networkId: number,
    tokenAddress: string,
  ): Promise<number> {
    try {
      const provider = this.getProvider(networkId);
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const decimals = await contract.decimals();
      return Number(decimals);
    } catch (error) {
      logger.warn('Failed to fetch token decimals, using fallback', {
        tokenAddress,
        networkId,
        fallbackDecimals: 18,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 18;
    }
  }

  private isErc4337EntryPointTx(to?: string | null): boolean {
    if (!to) {
      return false;
    }

    return ERC4337_ENTRYPOINT_ADDRESSES.has(to.toLowerCase());
  }

  private parseTraceValueToBigInt(value: unknown): bigint {
    try {
      if (typeof value === 'bigint') {
        return value;
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) {
          return BigInt(0);
        }
        return BigInt(Math.floor(value));
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return BigInt(0);
        }
        return BigInt(trimmed);
      }
      return BigInt(0);
    } catch {
      return BigInt(0);
    }
  }

  private collectValueTransfersFromCallTrace(
    traceNode: {
      from?: unknown;
      to?: unknown;
      value?: unknown;
      calls?: unknown;
    },
    transfers: InternalValueTransfer[],
  ): void {
    if (!traceNode || typeof traceNode !== 'object') {
      return;
    }

    const from =
      typeof traceNode.from === 'string'
        ? normalizeAddress(traceNode.from)
        : '';
    const to =
      typeof traceNode.to === 'string' ? normalizeAddress(traceNode.to) : '';
    const value = this.parseTraceValueToBigInt(traceNode.value);

    if (from && to && value > BigInt(0)) {
      transfers.push({ from, to, value });
    }

    if (Array.isArray(traceNode.calls)) {
      for (const call of traceNode.calls) {
        this.collectValueTransfersFromCallTrace(call, transfers);
      }
    }
  }

  private async getInternalValueTransfers(
    networkId: number,
    txHash: string,
  ): Promise<InternalValueTransfer[]> {
    const provider = this.getProvider(networkId);

    try {
      const debugTraceResult = await provider.send('debug_traceTransaction', [
        txHash,
        { tracer: 'callTracer' },
      ]);
      const transfers: InternalValueTransfer[] = [];
      this.collectValueTransfersFromCallTrace(debugTraceResult, transfers);
      return transfers;
    } catch (debugTraceError) {
      logger.debug(
        'debug_traceTransaction is unavailable, trying trace_transaction',
        {
          txHash,
          networkId,
          error:
            debugTraceError instanceof Error
              ? debugTraceError.message
              : 'Unknown error',
        },
      );
    }

    try {
      const traceResult = await provider.send('trace_transaction', [txHash]);
      const calls = Array.isArray(traceResult) ? traceResult : [];
      const transfers: InternalValueTransfer[] = [];

      for (const call of calls) {
        if (!call || typeof call !== 'object') {
          continue;
        }

        const action = (call as { action?: unknown }).action;
        if (!action || typeof action !== 'object') {
          continue;
        }

        const typedAction = action as {
          from?: unknown;
          to?: unknown;
          value?: unknown;
        };

        const from =
          typeof typedAction.from === 'string'
            ? normalizeAddress(typedAction.from)
            : '';
        const to =
          typeof typedAction.to === 'string'
            ? normalizeAddress(typedAction.to)
            : '';
        const value = this.parseTraceValueToBigInt(typedAction.value);

        if (from && to && value > BigInt(0)) {
          transfers.push({ from, to, value });
        }
      }

      return transfers;
    } catch (traceError) {
      logger.warn(
        'Failed to fetch internal value transfers from tracing RPCs',
        {
          txHash,
          networkId,
          error:
            traceError instanceof Error ? traceError.message : 'Unknown error',
        },
      );
      return [];
    }
  }

  private findBestMatchingInternalTransfer(params: {
    networkId: number;
    transfers: InternalValueTransfer[];
    expectedTo: string;
    expectedFrom?: string;
    expectedAmount?: number;
  }): DonationTransferInfo | null {
    const { networkId, transfers, expectedTo, expectedFrom, expectedAmount } =
      params;

    const nativeDecimals = getNetworkConfig(networkId).nativeCurrency.decimals;
    const expectedToLower = normalizeAddress(expectedTo);
    const expectedFromLower = expectedFrom
      ? normalizeAddress(expectedFrom)
      : null;

    const candidates = transfers
      .filter((transfer) => transfer.to === expectedToLower)
      .map((transfer) => {
        const normalizedAmount = Number(
          ethers.utils.formatUnits(transfer.value.toString(), nativeDecimals),
        );
        const amountMatch =
          typeof expectedAmount === 'number'
            ? closeTo(normalizedAmount, expectedAmount, 0.001)
            : false;
        const fromMatch = expectedFromLower
          ? transfer.from === expectedFromLower
          : false;
        const score = (amountMatch ? 3 : 0) + (fromMatch ? 2 : 0);
        return { transfer, score };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return null;
    }

    const best = candidates[0].transfer;
    return {
      from: best.from,
      to: best.to,
      amount: best.value,
      tokenAddress: NATIVE_TOKEN_ADDRESS,
      isNativeToken: true,
    };
  }

  private async resolveAaErc20Transfer(params: {
    input: TransactionDetailInput;
    receipt: ethers.providers.TransactionReceipt;
  }): Promise<{ transfer: DonationTransferInfo; amount: number } | null> {
    const { input, receipt } = params;
    const allTransfers = this.parseTransferEvents(receipt.logs);
    const expectedTo = normalizeAddress(input.toAddress);
    const expectedFrom = normalizeAddress(input.fromAddress);

    let candidates = allTransfers.filter(
      (transfer) => normalizeAddress(transfer.to) === expectedTo,
    );

    if (candidates.length === 0) {
      return null;
    }

    const normalizedExpectedTokenAddress = input.tokenAddress
      ? normalizeAddress(input.tokenAddress)
      : null;

    if (normalizedExpectedTokenAddress) {
      candidates = candidates.filter(
        (transfer) =>
          normalizeAddress(transfer.tokenAddress) ===
          normalizedExpectedTokenAddress,
      );
    }

    if (candidates.length === 0) {
      return null;
    }

    const decimalsCache = new Map<string, number>();
    const symbolCache = new Map<string, string | null>();

    const scored: Array<{
      transfer: DonationTransferInfo;
      score: number;
      amount: number;
    }> = [];

    for (const transfer of candidates) {
      const normalizedTokenAddress = normalizeAddress(transfer.tokenAddress);

      let decimals = decimalsCache.get(normalizedTokenAddress);
      if (decimals === undefined) {
        decimals = await this.getTokenDecimals(
          input.networkId,
          transfer.tokenAddress,
        );
        decimalsCache.set(normalizedTokenAddress, decimals);
      }

      const amount = Number(
        ethers.utils.formatUnits(transfer.amount.toString(), decimals),
      );
      const amountMatch = closeTo(amount, input.amount, 0.001);
      const fromMatch = normalizeAddress(transfer.from) === expectedFrom;

      let symbolMatch = true;
      if (!normalizedExpectedTokenAddress) {
        let tokenSymbol = symbolCache.get(normalizedTokenAddress);
        if (tokenSymbol === undefined) {
          tokenSymbol = await this.getTokenSymbol(
            input.networkId,
            transfer.tokenAddress,
          );
          symbolCache.set(normalizedTokenAddress, tokenSymbol);
        }
        if (tokenSymbol) {
          symbolMatch =
            tokenSymbol.toUpperCase() === input.symbol.toUpperCase();
        }
      }

      if (!symbolMatch) {
        continue;
      }

      const score = (amountMatch ? 3 : 0) + (fromMatch ? 2 : 0);
      scored.push({ transfer, score, amount });
    }

    if (scored.length === 0) {
      return null;
    }

    scored.sort((a, b) => b.score - a.score);
    return { transfer: scored[0].transfer, amount: scored[0].amount };
  }

  private async getAccountAbstractionTransactionInfo(
    input: TransactionDetailInput,
    tx: ethers.providers.TransactionResponse,
    receipt: ethers.providers.TransactionReceipt,
  ): Promise<NetworkTransactionInfo | null> {
    const { txHash, networkId, symbol } = input;
    const provider = this.getProvider(networkId);
    const block = await provider.getBlock(receipt.blockNumber);
    const timestamp = block?.timestamp || Math.floor(Date.now() / 1000);

    const expectsNativeToken = this.isNativeCurrencySymbol(networkId, symbol);

    if (expectsNativeToken) {
      const nativeDecimals =
        getNetworkConfig(networkId).nativeCurrency.decimals;
      const allDonations = this.parseDonationMadeEvents(receipt.logs, tx.from);
      const nativeDonations = allDonations.filter(
        (donation) => donation.isNativeToken,
      );
      const donationTransfer = this.findDonationTransfer(
        nativeDonations,
        input.toAddress,
        input.amount,
        nativeDecimals,
      );

      const internalTransfers = await this.getInternalValueTransfers(
        networkId,
        txHash,
      );

      if (donationTransfer) {
        const handlerAddresses = new Set(
          getDonationHandlerAddresses(networkId).map((address) =>
            normalizeAddress(address),
          ),
        );
        const expectedFrom = normalizeAddress(input.fromAddress);

        const senderToDonationHandler = internalTransfers
          .filter((transfer) => handlerAddresses.has(transfer.to))
          .sort((a, b) => {
            const aScore = a.from === expectedFrom ? 1 : 0;
            const bScore = b.from === expectedFrom ? 1 : 0;
            return bScore - aScore;
          })[0];

        const inferredFrom = senderToDonationHandler
          ? senderToDonationHandler.from
          : normalizeAddress(input.fromAddress);
        const nativeSymbol = getNetworkConfig(networkId).nativeCurrency.symbol;

        return {
          hash: tx.hash,
          amount: Number(
            ethers.utils.formatUnits(
              donationTransfer.amount.toString(),
              nativeDecimals,
            ),
          ),
          nonce: tx.nonce,
          from: inferredFrom,
          to: donationTransfer.to,
          currency: nativeSymbol,
          timestamp,
          status: TransactionStatus.SUCCESS,
          blockNumber: tx.blockNumber || undefined,
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: tx.gasPrice?.toString(),
        };
      }

      const nativeTransfer = this.findBestMatchingInternalTransfer({
        networkId,
        transfers: internalTransfers,
        expectedTo: input.toAddress,
        expectedFrom: input.fromAddress,
        expectedAmount: input.amount,
      });

      if (!nativeTransfer) {
        return null;
      }

      const nativeSymbol = getNetworkConfig(networkId).nativeCurrency.symbol;
      return {
        hash: tx.hash,
        amount: Number(
          ethers.utils.formatUnits(
            nativeTransfer.amount.toString(),
            nativeDecimals,
          ),
        ),
        nonce: tx.nonce,
        from: nativeTransfer.from,
        to: nativeTransfer.to,
        currency: nativeSymbol,
        timestamp,
        status: TransactionStatus.SUCCESS,
        blockNumber: tx.blockNumber || undefined,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice?.toString(),
      };
    }

    const resolvedTokenTransfer = await this.resolveAaErc20Transfer({
      input,
      receipt,
    });

    if (!resolvedTokenTransfer) {
      return null;
    }

    return {
      hash: tx.hash,
      amount: resolvedTokenTransfer.amount,
      nonce: tx.nonce,
      from: resolvedTokenTransfer.transfer.from,
      to: resolvedTokenTransfer.transfer.to,
      currency: symbol,
      timestamp,
      status: TransactionStatus.SUCCESS,
      blockNumber: tx.blockNumber || undefined,
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: tx.gasPrice?.toString(),
    };
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
        ethers.utils
          .parseUnits(expectedAmount.toString(), tokenDecimals)
          .toString(),
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
    const { txHash, networkId, toAddress, amount, symbol, tokenAddress } =
      input;

    logger.debug('Getting donation handler transaction info', {
      txHash,
      networkId,
      toAddress,
      symbol,
      tokenAddress,
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

    // For non-native tokens, tokenAddress is required
    if (!expectsNativeToken && !tokenAddress) {
      throw new BlockchainError(
        BlockchainErrorCode.TOKEN_MISMATCH,
        `Token address is required for ERC-20 token verification (symbol: ${symbol})`,
        {
          txHash,
          networkId,
          symbol,
          message:
            'For non-native token donations, please provide the token contract address',
        },
      );
    }

    // For non-native tokens, validate that the symbol matches the token contract
    if (!expectsNativeToken && tokenAddress) {
      const actualSymbol = await this.getTokenSymbol(networkId, tokenAddress);

      if (actualSymbol) {
        const normalizedExpectedSymbol = symbol.toUpperCase();
        const normalizedActualSymbol = actualSymbol.toUpperCase();

        if (normalizedExpectedSymbol !== normalizedActualSymbol) {
          throw new BlockchainError(
            BlockchainErrorCode.TOKEN_MISMATCH,
            `Token symbol mismatch: expected ${symbol}, but token contract ${tokenAddress} has symbol ${actualSymbol}`,
            {
              txHash,
              networkId,
              expectedSymbol: symbol,
              actualSymbol,
              tokenAddress,
            },
          );
        }

        logger.debug('Token symbol validated', {
          txHash,
          tokenAddress,
          expectedSymbol: symbol,
          actualSymbol,
        });
      } else {
        logger.warn(
          'Could not fetch token symbol for validation, proceeding with address-based validation only',
          {
            txHash,
            tokenAddress,
            expectedSymbol: symbol,
          },
        );
      }
    }

    logger.debug('Token type expectation', {
      txHash,
      symbol,
      expectsNativeToken,
      tokenAddress: tokenAddress || null,
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
      const nativeDecimals =
        getNetworkConfig(networkId).nativeCurrency.decimals;
      const nativeDonations = allDonations.filter((d) => d.isNativeToken);
      donationTransfer = this.findDonationTransfer(
        nativeDonations,
        toAddress,
        amount,
        nativeDecimals,
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
      // tokenAddress is required for ERC-20 (validated above)
      const normalizedExpectedTokenAddress = tokenAddress!.toLowerCase();
      const erc20TokenDecimals = await this.getTokenDecimals(
        networkId,
        tokenAddress!,
      );

      // First try DonationMade events for ERC-20 tokens
      let erc20Donations = allDonations.filter((d) => !d.isNativeToken);
      erc20Donations = erc20Donations.filter(
        (d) => d.tokenAddress.toLowerCase() === normalizedExpectedTokenAddress,
      );

      donationTransfer = this.findDonationTransfer(
        erc20Donations,
        toAddress,
        amount,
        erc20TokenDecimals,
      );

      // If not found in DonationMade events, try Transfer events
      if (!donationTransfer) {
        let transfers = this.parseTransferEvents(receipt.logs);
        transfers = transfers.filter(
          (t) =>
            t.tokenAddress.toLowerCase() === normalizedExpectedTokenAddress,
        );

        logger.debug('Parsed Transfer events from donation handler', {
          txHash,
          transferCount: transfers.length,
          toAddress,
          filterByTokenAddress: !!normalizedExpectedTokenAddress,
        });

        donationTransfer = this.findDonationTransfer(
          transfers,
          toAddress,
          amount,
          erc20TokenDecimals,
        );
      }

      if (!donationTransfer) {
        const errorMessage = normalizedExpectedTokenAddress
          ? `No ERC-20 token transfer found to recipient ${toAddress} with token ${tokenAddress} in donation handler transaction`
          : `No ERC-20 token transfer found to recipient ${toAddress} in donation handler transaction`;

        throw new BlockchainError(
          BlockchainErrorCode.TO_ADDRESS_MISMATCH,
          errorMessage,
          {
            txHash,
            networkId,
            expectedTo: toAddress,
            expectedToken: symbol,
            expectedTokenAddress: tokenAddress || undefined,
            expectedTokenType: 'ERC-20',
          },
        );
      }

      // Additional validation: if token address was provided, verify the found transfer matches
      if (
        normalizedExpectedTokenAddress &&
        donationTransfer.tokenAddress.toLowerCase() !==
          normalizedExpectedTokenAddress
      ) {
        throw new BlockchainError(
          BlockchainErrorCode.TOKEN_MISMATCH,
          `Token address mismatch: expected ${tokenAddress}, but found transfer from ${donationTransfer.tokenAddress}`,
          {
            txHash,
            networkId,
            expectedTokenAddress: tokenAddress,
            actualTokenAddress: donationTransfer.tokenAddress,
          },
        );
      }
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const timestamp = block?.timestamp || Math.floor(Date.now() / 1000);

    // Use actual token/native decimals for normalized amount
    const decimals = donationTransfer.isNativeToken
      ? getNetworkConfig(networkId).nativeCurrency.decimals
      : await this.getTokenDecimals(networkId, donationTransfer.tokenAddress);
    const transferAmount = Number(
      ethers.utils.formatUnits(donationTransfer.amount.toString(), decimals),
    );

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
    const { txHash, symbol, networkId } = input;

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

      if (receipt && this.isErc4337EntryPointTx(tx.to)) {
        logger.info('Detected EIP-4337 EntryPoint transaction', {
          txHash,
          networkId,
          entryPointAddress: tx.to,
          symbol,
        });

        const aaTransactionInfo =
          await this.getAccountAbstractionTransactionInfo(input, tx, receipt);

        if (aaTransactionInfo) {
          return aaTransactionInfo;
        }

        throw new BlockchainError(
          BlockchainErrorCode.TO_ADDRESS_MISMATCH,
          `Could not resolve donation transfer details from Account Abstraction transaction: ${txHash}`,
          {
            txHash,
            networkId,
            entryPointAddress: tx.to,
            expectedTo: input.toAddress,
            expectedFrom: input.fromAddress,
            expectedAmount: input.amount,
          },
        );
      }

      const block = receipt
        ? await provider.getBlock(receipt.blockNumber)
        : null;
      const timestamp = block?.timestamp || Math.floor(Date.now() / 1000);

      const expectsNativeToken = this.isNativeCurrencySymbol(networkId, symbol);
      let txAmount: number;
      let fromAddress = tx.from;
      let toAddress = tx.to || '';

      if (expectsNativeToken) {
        const nativeDecimals =
          getNetworkConfig(networkId).nativeCurrency.decimals;
        txAmount = Number(
          ethers.utils.formatUnits(tx.value.toString(), nativeDecimals),
        );
      } else {
        // Direct ERC-20: amount must be read from Transfer logs, not from input
        if (!receipt || !receipt.logs.length) {
          throw new BlockchainError(
            BlockchainErrorCode.TRANSACTION_NOT_FOUND,
            receipt
              ? `No transfer logs found for direct ERC-20 verification: ${txHash}`
              : `Transaction receipt not available (pending?): ${txHash}. Cannot verify ERC-20 amount without receipt.`,
            { txHash, networkId },
          );
        }
        let transfers = this.parseTransferEvents(receipt.logs);
        const expectedTo = normalizeAddress(input.toAddress);
        transfers = transfers.filter(
          (t) => normalizeAddress(t.to) === expectedTo,
        );
        if (input.tokenAddress) {
          const expectedToken = normalizeAddress(input.tokenAddress);
          transfers = transfers.filter(
            (t) => normalizeAddress(t.tokenAddress) === expectedToken,
          );
        }
        if (input.fromAddress) {
          const expectedFrom = normalizeAddress(input.fromAddress);
          transfers = transfers.filter(
            (t) => normalizeAddress(t.from) === expectedFrom,
          );
        }
        if (transfers.length === 0) {
          throw new BlockchainError(
            BlockchainErrorCode.TO_ADDRESS_MISMATCH,
            `No ERC-20 transfer found to ${input.toAddress} in transaction ${txHash}`,
            { txHash, networkId, expectedTo: input.toAddress },
          );
        }
        const tokenAddressForDecimals =
          input.tokenAddress || transfers[0].tokenAddress;
        const decimals = await this.getTokenDecimals(
          networkId,
          tokenAddressForDecimals,
        );
        const selected = this.findDonationTransfer(
          transfers,
          input.toAddress,
          input.amount,
          decimals,
        );
        if (!selected) {
          throw new BlockchainError(
            BlockchainErrorCode.TO_ADDRESS_MISMATCH,
            `No matching ERC-20 transfer found in transaction ${txHash}`,
            { txHash, networkId, expectedTo: input.toAddress },
          );
        }
        txAmount = Number(
          ethers.utils.formatUnits(selected.amount.toString(), decimals),
        );
        fromAddress = selected.from;
        toAddress = selected.to;
      }

      const transactionInfo: NetworkTransactionInfo = {
        hash: tx.hash,
        amount: txAmount,
        nonce: tx.nonce,
        from: fromAddress,
        to: toAddress,
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
