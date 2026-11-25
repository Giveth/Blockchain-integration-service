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
  isValidEthereumAddress,
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

// Bounded concurrency for enriching DonationMade logs (block-timestamp + tx-
// sender lookups), so a wide range with many events doesn't burst the RPC with
// an unbounded number of in-flight requests.
const LOG_ENRICHMENT_CONCURRENCY = 8;

// Code of an EIP-7702-delegated EOA: 0xef0100 || delegate address.
const EIP7702_DELEGATION_PREFIX = '0xef0100';

// EIP-4337 EntryPoint contracts (v0.6 + v0.7)
const ERC4337_ENTRYPOINT_ADDRESSES = new Set<string>([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
]);

// EntryPoint event emitted after each UserOperation executes (same in v0.6 and
// v0.7). topic[2] is the UserOperation sender (the smart account).
// keccak256("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)")
const USER_OPERATION_EVENT_SIGNATURE =
  '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';

// Minimal ERC-20 ABI for symbol() function
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// Minimal ERC-721 ABI for ownership checks
const ERC721_ABI = ['function balanceOf(address owner) view returns (uint256)'];

interface InternalValueTransfer {
  from: string;
  to: string;
  value: bigint;
}

// One value-carrying call into a DonationHandler, with the value the handler
// paid out from inside that same call (directly, or through a proxy's
// delegatecall). Lets a native DonationMade be tied to the wallet that funded
// it, rather than to anyone who sent value somewhere in the transaction.
interface HandlerValueCall {
  from: string;
  value: bigint;
  payouts: Array<{ to: string; value: bigint }>;
}

interface RawTraceCall {
  from: string;
  to: string;
  value: bigint;
  callType: string;
}

export interface DonationTransferInfo {
  from: string;
  to: string;
  amount: bigint;
  tokenAddress: string;
  isNativeToken?: boolean;
  // Receipt log index of the event this transfer was decoded from, when known.
  logIndex?: number;
}

// A single decoded DonationMade event, enriched with the transaction sender and
// block timestamp, returned by the block-range reconciler scan (#393). `amount`
// is the raw on-chain value in wei, serialized as a string because a JS bigint
// is not JSON-serializable.
export interface DonationMadeLog {
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: number;
  from: string;
  to: string;
  tokenAddress: string;
  amount: string;
  isNativeToken: boolean;
}

export interface DonationHandlerLogsResult {
  networkId: number;
  fromBlock: number;
  toBlock: number;
  latestBlock: number;
  logs: DonationMadeLog[];
}

export class EvmTransactionService implements IChainHandler {
  private providers: Map<number, ethers.providers.JsonRpcProvider> = new Map();

  private formatAmountForTokenDecimals(
    amount: number,
    tokenDecimals: number,
  ): string {
    if (!Number.isFinite(amount)) {
      throw new Error(`Invalid token amount: ${amount}`);
    }

    const fractionDigits = Math.min(Math.max(tokenDecimals + 12, 20), 100);
    const [whole, fraction = ''] = amount.toFixed(fractionDigits).split('.');
    const clampedFraction = fraction.slice(0, tokenDecimals).replace(/0+$/, '');

    return clampedFraction ? `${whole}.${clampedFraction}` : whole;
  }

  private parseExpectedAmountRaw(
    expectedAmount: number,
    tokenDecimals: number,
  ): bigint {
    return BigInt(
      ethers.utils
        .parseUnits(
          this.formatAmountForTokenDecimals(expectedAmount, tokenDecimals),
          tokenDecimals,
        )
        .toString(),
    );
  }

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

  async checkErc721Ownership(
    networkId: number,
    walletAddress: string,
    contractAddress: string,
  ): Promise<boolean> {
    if (!this.isSupported(networkId)) {
      throw new BlockchainError(
        BlockchainErrorCode.UNSUPPORTED_CHAIN,
        `ERC-721 ownership checks are only supported on EVM networks (received ${networkId})`,
        { networkId },
      );
    }

    if (!isValidEthereumAddress(walletAddress)) {
      throw new BlockchainError(
        BlockchainErrorCode.PROVIDER_ERROR,
        'Invalid wallet address for ERC-721 ownership check',
        { walletAddress, networkId },
      );
    }

    if (!isValidEthereumAddress(contractAddress)) {
      throw new BlockchainError(
        BlockchainErrorCode.PROVIDER_ERROR,
        'Invalid contract address for ERC-721 ownership check',
        { contractAddress, networkId },
      );
    }

    try {
      const provider = this.getProvider(networkId);
      const contract = new ethers.Contract(
        contractAddress,
        ERC721_ABI,
        provider,
      );
      const balance: ethers.BigNumber = await contract.balanceOf(walletAddress);

      return balance.gt(0);
    } catch (error) {
      logger.error('Failed to check ERC-721 ownership', {
        networkId,
        walletAddress,
        contractAddress,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        'Failed to check ERC-721 ownership',
        {
          networkId,
          walletAddress,
          contractAddress,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
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

  private toRawTraceCall(node: unknown): RawTraceCall | null {
    if (!node || typeof node !== 'object') {
      return null;
    }
    const typed = node as {
      from?: unknown;
      to?: unknown;
      value?: unknown;
      type?: unknown;
      callType?: unknown;
    };
    const kind = typed.callType ?? typed.type;
    return {
      from: typeof typed.from === 'string' ? normalizeAddress(typed.from) : '',
      to: typeof typed.to === 'string' ? normalizeAddress(typed.to) : '',
      value: this.parseTraceValueToBigInt(typed.value),
      callType: typeof kind === 'string' ? kind.toLowerCase() : 'call',
    };
  }

  private isRevertedTraceFrame(frame: unknown): boolean {
    const error = (frame as { error?: unknown } | null)?.error;
    return error !== undefined && error !== null && error !== '';
  }

  /**
   * Value-carrying calls into a DonationHandler, each with the payouts the
   * handler made inside that call. Returns null when no tracing RPC is
   * available (or the trace has no call nesting), so callers can tell
   * "unknown" apart from "nothing matched".
   */
  private async getHandlerValueCalls(
    networkId: number,
    txHash: string,
  ): Promise<HandlerValueCall[] | null> {
    const provider = this.getProvider(networkId);
    const handlerAddresses = new Set(
      getDonationHandlerAddresses(networkId).map((address) =>
        normalizeAddress(address),
      ),
    );

    let debugTraceTransient = false;
    try {
      const root = await provider.send('debug_traceTransaction', [
        txHash,
        { tracer: 'callTracer' },
      ]);
      const calls: HandlerValueCall[] = [];
      // A reverted frame (e.g. one call of a try/catch batch) moved no value,
      // nor did anything under it, so it and its whole subtree are skipped.
      const childrenOf = (node: unknown): unknown[] => {
        const children = (node as { calls?: unknown })?.calls;
        return Array.isArray(children)
          ? children.filter((child) => !this.isRevertedTraceFrame(child))
          : [];
      };
      // The handler pays out in its own frame, or (behind a proxy) inside a
      // delegatecall frame that still runs as the handler address.
      const collectPayouts = (
        node: unknown,
        handler: string,
        payouts: HandlerValueCall['payouts'],
      ): void => {
        for (const child of childrenOf(node)) {
          const call = this.toRawTraceCall(child);
          if (!call) {
            continue;
          }
          if (
            call.callType === 'delegatecall' ||
            call.callType === 'callcode'
          ) {
            collectPayouts(child, handler, payouts);
          } else if (call.from === handler && call.value > BigInt(0)) {
            payouts.push({ to: call.to, value: call.value });
          }
        }
      };
      const walk = (node: unknown): void => {
        const call = this.toRawTraceCall(node);
        if (!call) {
          return;
        }
        if (
          handlerAddresses.has(call.to) &&
          call.callType === 'call' &&
          call.value > BigInt(0)
        ) {
          const payouts: HandlerValueCall['payouts'] = [];
          collectPayouts(node, call.to, payouts);
          calls.push({ from: call.from, value: call.value, payouts });
        }
        for (const child of childrenOf(node)) {
          walk(child);
        }
      };
      if (!this.isRevertedTraceFrame(root)) {
        walk(root);
      }
      return calls;
    } catch (debugTraceError) {
      debugTraceTransient = this.isTransientRpcError(debugTraceError);
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
      const result = await provider.send('trace_transaction', [txHash]);
      const allEntries = (Array.isArray(result) ? result : [])
        .map((entry: unknown) => {
          const typed = entry as { action?: unknown; traceAddress?: unknown };
          const call = this.toRawTraceCall(typed?.action);
          const traceAddress = typed?.traceAddress;
          if (!call || !Array.isArray(traceAddress)) {
            return null;
          }
          return {
            call,
            path: traceAddress.map(Number),
            reverted: this.isRevertedTraceFrame(entry),
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            call: RawTraceCall;
            path: number[];
            reverted: boolean;
          } => entry !== null,
        );
      if (allEntries.length === 0) {
        if (debugTraceTransient) {
          throw this.traceUnavailableError(networkId, txHash);
        }
        return null;
      }
      // Drop reverted entries and everything under them (their traceAddress
      // starts with a reverted entry's traceAddress).
      const revertedPaths = allEntries
        .filter((entry) => entry.reverted)
        .map((entry) => entry.path);
      const entries = allEntries.filter(
        (entry) =>
          !revertedPaths.some(
            (reverted) =>
              reverted.length <= entry.path.length &&
              reverted.every((step, i) => entry.path[i] === step),
          ),
      );

      const byPath = new Map(entries.map((e) => [e.path.join(','), e.call]));
      const calls: HandlerValueCall[] = [];
      for (const entry of entries) {
        const { call, path } = entry;
        if (
          !handlerAddresses.has(call.to) ||
          call.callType !== 'call' ||
          call.value <= BigInt(0)
        ) {
          continue;
        }
        const payouts = entries
          .filter((candidate) => {
            const sub = candidate.path;
            if (
              sub.length <= path.length ||
              path.some((step, i) => sub[i] !== step) ||
              candidate.call.from !== call.to ||
              candidate.call.callType !== 'call' ||
              candidate.call.value <= BigInt(0)
            ) {
              return false;
            }
            // Every frame between the handler call and the payout must be a
            // delegatecall, i.e. still running as the handler.
            for (let depth = path.length + 1; depth < sub.length; depth++) {
              const between = byPath.get(sub.slice(0, depth).join(','));
              if (between?.callType !== 'delegatecall') {
                return false;
              }
            }
            return true;
          })
          .map((candidate) => ({
            to: candidate.call.to,
            value: candidate.call.value,
          }));
        calls.push({ from: call.from, value: call.value, payouts });
      }
      return calls;
    } catch (traceError) {
      if (traceError instanceof BlockchainError) {
        throw traceError;
      }
      // A transient failure (timeout, 429, 5xx) on either tracer must not be
      // read as "no tracer": verification would settle the donation on
      // tx.from. Throw a retryable NETWORK_ERROR instead (core retries with
      // its own limit). Anything we can't tell apart counts as unsupported.
      const transient =
        debugTraceTransient || this.isTransientRpcError(traceError);
      logger.warn('Failed to fetch handler calls from tracing RPCs', {
        txHash,
        networkId,
        transient,
        error:
          traceError instanceof Error ? traceError.message : 'Unknown error',
      });
      if (transient) {
        throw this.traceUnavailableError(networkId, txHash);
      }
      return null;
    }
  }

  /**
   * Reconciler variant: a trace failure never fails the scan. A failure that
   * repeats on every retry (tracer timeout on a big tx, response too large)
   * would otherwise stall the range forever, so keep tx.from instead.
   */
  private async getHandlerValueCallsForScan(
    networkId: number,
    txHash: string,
  ): Promise<HandlerValueCall[] | null> {
    try {
      return await this.getHandlerValueCalls(networkId, txHash);
    } catch (error) {
      logger.warn('Tracing failed during log enrichment; keeping tx.from', {
        networkId,
        txHash,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  private traceUnavailableError(
    networkId: number,
    txHash: string,
  ): BlockchainError {
    return new BlockchainError(
      BlockchainErrorCode.NETWORK_ERROR,
      `Tracing RPC temporarily failed for ${txHash} on network ${networkId}`,
      { networkId, txHash },
    );
  }

  /**
   * Whether an RPC failure is worth retrying (timeout, rate limit, 5xx,
   * dropped connection), as opposed to the method or the historical state
   * being unavailable on this node. Unsupported markers win, and anything
   * unrecognised counts as not transient.
   */
  private isTransientRpcError(error: unknown): boolean {
    // Free text (message, reason, body) is only searched for markers. Status
    // codes come from structured fields alone: the text embeds the request
    // body, whose JSON-RPC "id" (or the tx hash) must not read as a 5xx.
    const texts: string[] = [];
    const statuses: number[] = [];
    const rpcCodes: number[] = [];
    const visit = (value: unknown, depth: number): void => {
      if (!value || typeof value !== 'object' || depth > 3) {
        return;
      }
      const typed = value as Record<string, unknown>;
      for (const key of ['message', 'reason', 'body']) {
        if (typeof typed[key] === 'string') {
          texts.push(typed[key] as string);
        }
      }
      if (typeof typed.code === 'string') {
        texts.push(typed.code);
      } else if (typeof typed.code === 'number') {
        rpcCodes.push(typed.code);
      }
      if (typeof typed.status === 'number') {
        statuses.push(typed.status);
      }
      // ethers keeps the JSON-RPC error payload as a string `body`.
      if (typeof typed.body === 'string') {
        try {
          const code = (
            JSON.parse(typed.body) as { error?: { code?: unknown } }
          )?.error?.code;
          if (typeof code === 'number') {
            rpcCodes.push(code);
          }
        } catch {
          // Not JSON; the text markers still apply.
        }
      }
      visit(typed.error, depth + 1);
      visit(typed.serverError, depth + 1);
    };
    if (error instanceof Error || (error && typeof error === 'object')) {
      visit(error, 0);
    } else if (error !== undefined && error !== null) {
      texts.push(String(error));
    }
    const text = texts.join(' ').toLowerCase();

    // Checked first, and wins: errors that fail the same way on every retry.
    const unsupported = [
      'method not found',
      'does not exist',
      'not supported',
      'unsupported',
      'not available',
      'not whitelisted',
      'not allowed',
      'disabled',
      'missing trie node',
      'historical state',
      'pruned',
      'execution timeout',
      'size limit',
    ];
    if (
      rpcCodes.includes(-32601) ||
      unsupported.some((marker) => text.includes(marker))
    ) {
      return false;
    }

    const transient = [
      'timeout',
      'timed out',
      'etimedout',
      'econnreset',
      'econnrefused',
      'socket hang up',
      'network_error',
      'missing response',
      'rate limit',
      'too many requests',
      'bad gateway',
      'service unavailable',
    ];
    return (
      statuses.some((status) => status === 429 || status >= 500) ||
      rpcCodes.includes(-32005) ||
      transient.some((marker) => text.includes(marker))
    );
  }

  /**
   * The wallets whose handler calls paid exactly `amount` to `recipient`.
   */
  private findNativeDonationFunders(
    handlerCalls: HandlerValueCall[],
    recipient: string,
    amount: bigint,
  ): string[] {
    const normalizedRecipient = normalizeAddress(recipient);
    return [
      ...new Set(
        handlerCalls
          .filter((call) =>
            call.payouts.some(
              (payout) =>
                payout.to === normalizedRecipient && payout.value === amount,
            ),
          )
          .map((call) => call.from),
      ),
    ];
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
    const { networkId, symbol } = input;
    const provider = this.getProvider(networkId);
    const block = await provider.getBlock(receipt.blockNumber);
    const timestamp = block?.timestamp || Math.floor(Date.now() / 1000);

    const expectsNativeToken = this.isNativeCurrencySymbol(networkId, symbol);

    if (expectsNativeToken) {
      const nativeDecimals =
        getNetworkConfig(networkId).nativeCurrency.decimals;
      const allDonations = this.parseDonationMadeEvents(
        receipt.logs,
        tx.from,
        networkId,
      );
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
        tx.hash,
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

        // Without a trace (RPC has no debug/trace API), attribute the event to
        // the UserOperation that emitted it. Never fall back to the caller's
        // claimed address: that would make the sender check compare the
        // claim with itself and let anyone claim this donation.
        const inferredFrom = senderToDonationHandler
          ? senderToDonationHandler.from
          : this.findUserOperationSenderForLog(
              receipt.logs,
              donationTransfer.logIndex,
            );

        if (!inferredFrom) {
          logger.warn(
            'Could not attribute AA DonationMade event to a sender; rejecting',
            { txHash: tx.hash, networkId, toAddress: input.toAddress },
          );
          return null;
        }

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
            logIndex: log.logIndex,
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

  private hasDonationHandlerLog(
    networkId: number,
    logs: ethers.providers.Log[],
  ): boolean {
    return logs.some((log) => isDonationHandlerAddress(networkId, log.address));
  }

  /**
   * Find the smart account whose UserOperation emitted the log at `logIndex`.
   *
   * The EntryPoint runs a bundle's UserOperations one after another and emits
   * `UserOperationEvent` right after each one finishes, so the logs an
   * operation produced sit just before its own `UserOperationEvent`. The
   * first `UserOperationEvent` (emitted by a known EntryPoint) after
   * `logIndex` therefore names the sender that produced that log.
   */
  private findUserOperationSenderForLog(
    logs: ethers.providers.Log[],
    logIndex: number | undefined,
  ): string | null {
    if (logIndex === undefined) {
      return null;
    }

    const userOperationEvent = logs
      .filter(
        (log) =>
          log.topics[0] === USER_OPERATION_EVENT_SIGNATURE &&
          log.topics.length >= 3 &&
          ERC4337_ENTRYPOINT_ADDRESSES.has(normalizeAddress(log.address)) &&
          log.logIndex > logIndex,
      )
      .sort((a, b) => a.logIndex - b.logIndex)[0];

    if (!userOperationEvent) {
      return null;
    }

    return normalizeAddress('0x' + userOperationEvent.topics[2].substring(26));
  }

  private getDonationSenderAddress(
    input: TransactionDetailInput,
    tx: ethers.providers.TransactionResponse,
    receipt: ethers.providers.TransactionReceipt,
  ): string {
    const txTo = tx.to ? normalizeAddress(tx.to) : null;
    const expectedFrom = normalizeAddress(input.fromAddress);
    const hasDonationHandlerLog = this.hasDonationHandlerLog(
      input.networkId,
      receipt.logs,
    );

    // Safe executions submit the outer transaction to the Safe contract,
    // while the donation handler call happens internally and emits logs.
    if (
      txTo &&
      hasDonationHandlerLog &&
      ((input.safeTxHash && !isDonationHandlerAddress(input.networkId, txTo)) ||
        txTo === expectedFrom)
    ) {
      return tx.to!;
    }

    return tx.from;
  }

  private inferErc20DonationSenderFromFundingTransfer(params: {
    receipt: ethers.providers.TransactionReceipt;
    networkId: number;
    tokenAddress: string;
    expectedFrom: string;
    recipient: string;
    donationAmountRaw: bigint;
  }): string | null {
    const {
      receipt,
      networkId,
      tokenAddress,
      expectedFrom,
      recipient,
      donationAmountRaw,
    } = params;
    const normalizedExpectedFrom = normalizeAddress(expectedFrom);
    const normalizedTokenAddress = normalizeAddress(tokenAddress);
    const handlerAddresses = new Set(
      getDonationHandlerAddresses(networkId).map((address) =>
        normalizeAddress(address),
      ),
    );
    const normalizedRecipient = normalizeAddress(recipient);
    const tokenTransfersFromDonor = this.parseTransferEvents(
      receipt.logs,
    ).filter(
      (transfer) =>
        normalizeAddress(transfer.from) === normalizedExpectedFrom &&
        normalizeAddress(transfer.tokenAddress) === normalizedTokenAddress,
    );

    // Either the handler first pulls the total from the donor into itself
    // (donateManyERC20), or it moves the tokens straight from the donor to the
    // recipient (transferFrom(donor, recipient)). The second shape shows up
    // when a relayer submits the tx for a smart-account / EIP-7702 donor, so
    // tx.from is the relayer and only the Transfer event names the donor.
    const fundingTransfer = tokenTransfersFromDonor.find(
      (transfer) =>
        (handlerAddresses.has(normalizeAddress(transfer.to)) &&
          transfer.amount >= donationAmountRaw) ||
        (normalizeAddress(transfer.to) === normalizedRecipient &&
          transfer.amount === donationAmountRaw),
    );

    return fundingTransfer ? fundingTransfer.from : null;
  }

  /**
   * Parse DonationMade events from transaction logs
   * Used for both ERC-20 and native token donations through donation handler
   * Event: DonationMade(address indexed recipientAddress, uint256 amount, address indexed tokenAddress, bytes data)
   *
   * Only events emitted by a known DonationHandler of `networkId` are returned.
   * The event signature alone says nothing about who emitted it: any contract
   * can emit an identical `DonationMade` log claiming an arbitrary recipient
   * and amount, so trusting it would let a donor verify money they never sent.
   */
  private parseDonationMadeEvents(
    logs: ethers.providers.Log[],
    senderAddress: string,
    networkId: number,
  ): DonationTransferInfo[] {
    const donations: DonationTransferInfo[] = [];

    for (const log of logs) {
      try {
        if (
          log.topics[0] === DONATION_MADE_EVENT_SIGNATURE &&
          log.topics.length >= 3
        ) {
          if (!isDonationHandlerAddress(networkId, log.address)) {
            // Error level on purpose: a non-handler DonationMade log in a
            // donation transaction is the footprint of a forged-donation
            // attempt, and should be visible in the logs.
            logger.error(
              'Ignoring DonationMade event emitted by a non-handler contract',
              {
                networkId,
                txHash: log.transactionHash,
                emitter: log.address,
                logIndex: log.logIndex,
              },
            );
            continue;
          }

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
            from: senderAddress,
            to,
            amount,
            tokenAddress: isNativeToken ? NATIVE_TOKEN_ADDRESS : tokenAddress,
            isNativeToken,
            logIndex: log.logIndex,
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
      const expectedAmountBigInt = this.parseExpectedAmountRaw(
        expectedAmount,
        tokenDecimals,
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
   * Return the current head block number for an EVM network.
   */
  async getLatestBlockNumber(networkId: number): Promise<number> {
    const provider = this.getProvider(networkId);
    try {
      return await provider.getBlockNumber();
    } catch (error) {
      throw new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        `Failed to fetch latest block for network ${networkId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        { networkId },
      );
    }
  }

  /**
   * Scan `DonationMade` events emitted by the DonationHandler contract(s) of an
   * EVM network over a block range (#393 reconciler). Each returned event is
   * decoded (recipient, token, amount) and enriched with the transaction sender
   * (`from`) and the block timestamp, so the core reconciler cron can attribute
   * a missed/headless donation to a user and place it in the correct GIVbacks
   * round without touching the chain itself.
   *
   * When `fromBlock`/`toBlock` are omitted the method runs in "latest-only"
   * mode: it returns the current head block and no logs, letting the caller
   * seed its per-chain cursor without a historical scan.
   */
  async getDonationHandlerLogs(
    networkId: number,
    fromBlock?: number,
    toBlock?: number,
  ): Promise<DonationHandlerLogsResult> {
    if (!this.isSupported(networkId)) {
      throw new BlockchainError(
        BlockchainErrorCode.UNSUPPORTED_CHAIN,
        `Network ${networkId} is not a supported EVM chain`,
        { networkId },
      );
    }

    // getProvider throws INVALID_NETWORK_ID when no RPC URL is configured.
    const provider = this.getProvider(networkId);
    const latestBlock = await this.getLatestBlockNumber(networkId);

    // Latest-only mode: no range requested.
    if (fromBlock === undefined || toBlock === undefined) {
      return {
        networkId,
        fromBlock: latestBlock,
        toBlock: latestBlock,
        latestBlock,
        logs: [],
      };
    }

    // Never scan past the current head; getLogs against an out-of-range
    // toBlock errors on some RPCs.
    const effectiveTo = Math.min(toBlock, latestBlock);
    if (fromBlock > effectiveTo) {
      return {
        networkId,
        fromBlock,
        toBlock: effectiveTo,
        latestBlock,
        logs: [],
      };
    }

    const handlers = getDonationHandlerAddresses(networkId);
    if (handlers.length === 0) {
      return {
        networkId,
        fromBlock,
        toBlock: effectiveTo,
        latestBlock,
        logs: [],
      };
    }

    // ethers v5 getLogs accepts a single `address`; some networks (Polygon)
    // have more than one handler, so scan each address and merge.
    const rawLogs: ethers.providers.Log[] = [];
    for (const handler of handlers) {
      try {
        const logs = await provider.getLogs({
          address: handler,
          topics: [DONATION_MADE_EVENT_SIGNATURE],
          fromBlock,
          toBlock: effectiveTo,
        });
        rawLogs.push(...logs);
      } catch (error) {
        throw new BlockchainError(
          BlockchainErrorCode.NETWORK_ERROR,
          `Failed to fetch DonationMade logs for network ${networkId} blocks ${fromBlock}-${effectiveTo}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
          { networkId, fromBlock, toBlock: effectiveTo, handler },
        );
      }
    }

    // Decode the DonationMade logs, then enrich each with its block timestamp
    // and transaction sender. Block/tx lookups are de-duplicated (a batch tx
    // emits multiple events; many events can share a block) and fetched with
    // bounded concurrency so a wide range with many events doesn't fan out into
    // an unbounded burst of serial RPC round trips.
    const decoded = rawLogs
      .filter(
        (log) =>
          log.topics[0] === DONATION_MADE_EVENT_SIGNATURE &&
          log.topics.length >= 3,
      )
      .map((log) => {
        const rawTokenAddress = '0x' + log.topics[2].substring(26);
        const isNativeToken =
          rawTokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
        return {
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          to: '0x' + log.topics[1].substring(26),
          tokenAddress: isNativeToken ? NATIVE_TOKEN_ADDRESS : rawTokenAddress,
          amount: ethers.BigNumber.from(
            '0x' + log.data.substring(2, 66),
          ).toString(),
          isNativeToken,
        };
      });

    const uniqueBlockNumbers = [...new Set(decoded.map((d) => d.blockNumber))];
    const uniqueTxHashes = [...new Set(decoded.map((d) => d.transactionHash))];

    // Missing block/tx results (RPC hiccup, pruning, reorg) would corrupt the
    // record (block timestamp -> wrong donation date, empty sender -> dropped
    // donation), so fail the whole scan instead — the caller retries the range.
    const [blockEntries, txEntries] = await Promise.all([
      this.mapWithConcurrency(
        uniqueBlockNumbers,
        LOG_ENRICHMENT_CONCURRENCY,
        async (blockNumber): Promise<[number, number]> => {
          const block = await provider.getBlock(blockNumber);
          if (!block) {
            throw new BlockchainError(
              BlockchainErrorCode.NETWORK_ERROR,
              `Block ${blockNumber} was unavailable during log enrichment on network ${networkId}`,
              { networkId, blockNumber },
            );
          }
          return [blockNumber, block.timestamp];
        },
      ),
      this.mapWithConcurrency(
        uniqueTxHashes,
        LOG_ENRICHMENT_CONCURRENCY,
        // The receipt carries both the tx sender and the token Transfer logs
        // needed to attribute relayed donations, in a single lookup.
        async (
          transactionHash,
        ): Promise<[string, ethers.providers.TransactionReceipt]> => {
          const receipt = await provider.getTransactionReceipt(transactionHash);
          if (!receipt) {
            throw new BlockchainError(
              BlockchainErrorCode.NETWORK_ERROR,
              `Transaction ${transactionHash} was unavailable during log enrichment on network ${networkId}`,
              { networkId, transactionHash },
            );
          }
          return [transactionHash, receipt];
        },
      ),
    ]);

    const blockTimestamps = new Map<number, number>(blockEntries);
    const txReceipts = new Map<string, ethers.providers.TransactionReceipt>(
      txEntries,
    );
    const handlerAddresses = new Set(
      handlers.map((address) => normalizeAddress(address)),
    );
    const receiptOf = (txHash: string) =>
      txReceipts.get(txHash) as ethers.providers.TransactionReceipt;

    // Native donations only show their funder in a trace. Trace just the txs
    // that didn't call the handler directly (relayed / contract calls); when
    // tx.to is the handler the sender can only be tx.from.
    const nativeTraceTxHashes = [
      ...new Set(
        decoded
          .filter((d) => {
            const txTo = receiptOf(d.transactionHash).to;
            return (
              d.isNativeToken &&
              !!txTo &&
              !handlerAddresses.has(normalizeAddress(txTo))
            );
          })
          .map((d) => d.transactionHash),
      ),
    ];
    const handlerCallsByTx = new Map(
      await this.mapWithConcurrency(
        nativeTraceTxHashes,
        LOG_ENRICHMENT_CONCURRENCY,
        async (txHash): Promise<[string, HandlerValueCall[] | null]> => [
          txHash,
          await this.getHandlerValueCallsForScan(networkId, txHash),
        ],
      ),
    );

    const inferredFunders = decoded.map((d) => {
      const receipt = receiptOf(d.transactionHash);
      const funder = this.inferDonationMadeLogFunder({
        receipt,
        handlerAddresses,
        handlerCalls: handlerCallsByTx.get(d.transactionHash) ?? null,
        donation: d,
      });
      return funder && funder !== normalizeAddress(receipt.from)
        ? { address: funder, blockNumber: receipt.blockNumber }
        : null;
    });
    const codeKey = (funder: { address: string; blockNumber: number }) =>
      `${funder.address}@${funder.blockNumber}`;

    // A funder that is a contract (router, zap, executor, Safe) is not the
    // donor's wallet; only EOAs and EIP-7702-delegated EOAs replace tx.from.
    // Code is read at the donation's block: a helper contract that later
    // self-destructed would read as '0x' (an EOA) at the head.
    const funderLookups = [
      ...new Map(
        inferredFunders
          .filter(
            (f): f is { address: string; blockNumber: number } => f !== null,
          )
          .map((f) => [codeKey(f), f]),
      ).values(),
    ];
    const isWalletByFunder = new Map(
      await this.mapWithConcurrency(
        funderLookups,
        LOG_ENRICHMENT_CONCURRENCY,
        async (funder): Promise<[string, boolean]> => {
          const { address } = funder;
          try {
            const code = (
              await provider.getCode(address, funder.blockNumber)
            ).toLowerCase();
            return [
              codeKey(funder),
              code === '0x' || code.startsWith(EIP7702_DELEGATION_PREFIX),
            ];
          } catch (error) {
            // Historical state may be pruned on a non-archive RPC, which would
            // fail this range on every retry. Keep tx.from for this funder.
            logger.warn(
              'Code lookup failed during log enrichment; keeping tx.from',
              {
                networkId,
                address,
                blockNumber: funder.blockNumber,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            );
            return [codeKey(funder), false];
          }
        },
      ),
    );

    const logs: DonationMadeLog[] = decoded
      .map((d, i) => {
        const funder = inferredFunders[i];
        return {
          transactionHash: d.transactionHash,
          logIndex: d.logIndex,
          blockNumber: d.blockNumber,
          blockTimestamp: blockTimestamps.get(d.blockNumber) as number,
          from:
            funder && isWalletByFunder.get(codeKey(funder))
              ? funder.address
              : receiptOf(d.transactionHash).from,
          to: d.to,
          tokenAddress: d.tokenAddress,
          amount: d.amount,
          isNativeToken: d.isNativeToken,
        };
      })
      // Deterministic ordering so the cron processes events chronologically.
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

    return { networkId, fromBlock, toBlock: effectiveTo, latestBlock, logs };
  }

  /**
   * The wallet whose funds paid a reconciler DonationMade log, or null when it
   * can't be told. tx.from is wrong when a relayer submits for a smart-account
   * / EIP-7702 donor. For ERC-20 we look for the Transfer that paid this
   * recipient: straight from the donor (same token, recipient and amount), or
   * handler-to-recipient after the donor funded the handler, taking the
   * nearest Transfer before the DonationMade log. For native we use the traced
   * handler call that paid exactly this amount to this recipient.
   */
  private inferDonationMadeLogFunder(params: {
    receipt: ethers.providers.TransactionReceipt;
    handlerAddresses: Set<string>;
    handlerCalls: HandlerValueCall[] | null;
    donation: {
      logIndex: number;
      to: string;
      tokenAddress: string;
      amount: string;
      isNativeToken: boolean;
    };
  }): string | null {
    const { receipt, handlerAddresses, handlerCalls, donation } = params;
    const amount = BigInt(donation.amount);

    if (donation.isNativeToken) {
      if (!handlerCalls) {
        return null;
      }
      const funders = this.findNativeDonationFunders(
        handlerCalls,
        donation.to,
        amount,
      );
      return funders.length === 1 ? funders[0] : null;
    }

    const token = normalizeAddress(donation.tokenAddress);
    const recipient = normalizeAddress(donation.to);
    const byProximity = (a: DonationTransferInfo, b: DonationTransferInfo) =>
      this.logOrderKey(a.logIndex, donation.logIndex) -
      this.logOrderKey(b.logIndex, donation.logIndex);

    const tokenTransfers = this.parseTransferEvents(receipt.logs).filter(
      (transfer) => normalizeAddress(transfer.tokenAddress) === token,
    );
    const payout = tokenTransfers
      .filter(
        (transfer) =>
          normalizeAddress(transfer.to) === recipient &&
          transfer.amount === amount,
      )
      .sort(byProximity)[0];

    if (!payout) {
      return null;
    }
    if (!handlerAddresses.has(normalizeAddress(payout.from))) {
      return normalizeAddress(payout.from);
    }

    const funding = tokenTransfers
      .filter(
        (transfer) =>
          handlerAddresses.has(normalizeAddress(transfer.to)) &&
          !handlerAddresses.has(normalizeAddress(transfer.from)) &&
          transfer.amount >= amount,
      )
      .sort(byProximity)[0];

    return funding ? normalizeAddress(funding.from) : null;
  }

  /**
   * Sort key that puts logs before `reference` first, nearest first (the
   * handler moves the tokens, then emits DonationMade), and only then logs
   * after it, nearest first.
   */
  private logOrderKey(logIndex: number | undefined, reference: number): number {
    if (logIndex === undefined) {
      return Number.MAX_SAFE_INTEGER;
    }
    return logIndex <= reference
      ? reference - logIndex
      : Number.MAX_SAFE_INTEGER / 2 + (logIndex - reference);
  }

  /**
   * Map over items with a bounded number of in-flight async operations, so a
   * large batch of RPC lookups doesn't burst the provider. Rejects as soon as
   * any task throws (workers stop pulling new work once the batch settles).
   */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const runWorker = async (): Promise<void> => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    };
    const workerCount = Math.min(Math.max(limit, 1), items.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
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

    if (!txHash) {
      throw new BlockchainError(
        BlockchainErrorCode.INVALID_TRANSACTION_HASH,
        'Transaction hash is required for donation handler verification',
        { networkId },
      );
    }

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
    const donationSenderAddress = this.getDonationSenderAddress(
      input,
      tx,
      receipt,
    );
    const allDonations = this.parseDonationMadeEvents(
      receipt.logs,
      donationSenderAddress,
      networkId,
    );

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

      // A relayer (tx.from) may submit for a smart-account / EIP-7702 donor;
      // the donor's value then reaches the handler as an internal call. When
      // tx.to is the handler itself the sender can only be tx.from, so there
      // is nothing to trace. Otherwise credit the expected donor only when the
      // trace shows their own handler call paying exactly this donation to
      // this recipient, and no other wallet's call doing the same.
      const expectedFrom = normalizeAddress(input.fromAddress);
      if (
        normalizeAddress(donationTransfer.from) !== expectedFrom &&
        tx.to &&
        !isDonationHandlerAddress(networkId, tx.to)
      ) {
        const handlerCalls = await this.getHandlerValueCalls(networkId, txHash);
        const funders = handlerCalls
          ? this.findNativeDonationFunders(
              handlerCalls,
              donationTransfer.to,
              donationTransfer.amount,
            )
          : [];
        if (funders.length === 1 && funders[0] === expectedFrom) {
          logger.debug(
            'Inferred native donation sender from its handler call',
            {
              txHash,
              donationEventSender: donationTransfer.from,
              inferredSender: expectedFrom,
            },
          );
          donationTransfer = { ...donationTransfer, from: expectedFrom };
        }
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

      if (donationTransfer) {
        const inferredSender = this.inferErc20DonationSenderFromFundingTransfer(
          {
            receipt,
            networkId,
            tokenAddress: tokenAddress!,
            expectedFrom: input.fromAddress,
            recipient: donationTransfer.to,
            donationAmountRaw: donationTransfer.amount,
          },
        );

        if (inferredSender) {
          logger.debug(
            'Inferred ERC-20 donation sender from funding transfer',
            {
              txHash,
              donationEventSender: donationTransfer.from,
              inferredSender,
            },
          );
          donationTransfer = {
            ...donationTransfer,
            from: inferredSender,
          };
        }
      }

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

  async getTransactionInfo(
    input: TransactionDetailInput,
  ): Promise<NetworkTransactionInfo> {
    const { txHash, symbol, networkId } = input;

    logger.debug('Getting EVM transaction info', {
      txHash,
      networkId,
      symbol,
    });

    if (!txHash || !isValidEvmTransactionHash(txHash)) {
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

      // Safe executions call the Safe contract as the outer tx target,
      // so detect donation handler activity from receipt logs as well.
      if (
        (tx.to && isDonationHandlerAddress(networkId, tx.to)) ||
        (receipt && this.hasDonationHandlerLog(networkId, receipt.logs))
      ) {
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
