import { ChainType, TransactionDetailInput, NetworkTransactionInfo } from '../../types';
import { evmTransactionService } from './evm/evmTransactionService';
import { solanaTransactionService } from './solana/solanaTransactionService';
import { stellarTransactionService } from './stellar/stellarTransactionService';
import { cardanoTransactionService } from './cardano/cardanoTransactionService';
import { getChainType } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Main entry point for getting transaction information from any supported blockchain
 */
export async function getTransactionInfoFromNetwork(
  input: TransactionDetailInput,
): Promise<NetworkTransactionInfo> {
  const chainType = input.chainType || getChainType(input.networkId);

  logger.debug('Getting transaction info from network', {
    txHash: input.txHash,
    networkId: input.networkId,
    chainType,
  });

  switch (chainType) {
    case ChainType.EVM:
      return evmTransactionService.getTransactionInfo(input);
    
    case ChainType.SOLANA:
      return solanaTransactionService.getTransactionInfo(input);
    
    case ChainType.STELLAR:
      return stellarTransactionService.getTransactionInfo(input);
    
    case ChainType.CARDANO:
      return cardanoTransactionService.getTransactionInfo(input);
    
    default:
      throw new Error(`Unsupported chain type: ${chainType}`);
  }
}

export * from './evm/evmTransactionService';
export * from './solana/solanaTransactionService';
export * from './stellar/stellarTransactionService';
export * from './cardano/cardanoTransactionService';

