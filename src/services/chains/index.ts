import {
  ChainType,
  TransactionDetailInput,
  NetworkTransactionInfo,
} from '../../types';
import { getChainType } from '../../config';
import { chainRegistry } from './ChainRegistry';
import { evmTransactionService } from './evm/evmTransactionService';
import { solanaTransactionService } from './solana/solanaTransactionService';

chainRegistry.registerHandler(ChainType.EVM, evmTransactionService);
chainRegistry.registerHandler(ChainType.SOLANA, solanaTransactionService);

export async function getTransactionInfoFromNetwork(
  input: TransactionDetailInput,
): Promise<NetworkTransactionInfo> {
  return chainRegistry.getTransactionInfo(input);
}

/**
 * Get transaction timestamp directly from the network
 * This method bypasses donation handler logic since we only need the block timestamp
 */
export async function getTransactionTimestampFromNetwork(
  txHash: string,
  networkId: number,
): Promise<number> {
  const chainType = getChainType(networkId);

  if (chainType === ChainType.EVM) {
    return evmTransactionService.getTransactionTimestamp(txHash, networkId);
  } else if (chainType === ChainType.SOLANA) {
    return solanaTransactionService.getTransactionTimestamp(txHash, networkId);
  }

  throw new Error(`Unsupported chain type for network ${networkId}`);
}

export * from './ChainRegistry';
export * from './evm/evmTransactionService';
export * from './solana/solanaTransactionService';
