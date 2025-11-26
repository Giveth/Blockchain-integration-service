import {
  ChainType,
  TransactionDetailInput,
  NetworkTransactionInfo,
} from '../../types';
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

export * from './ChainRegistry';
export * from './evm/evmTransactionService';
export * from './solana/solanaTransactionService';
