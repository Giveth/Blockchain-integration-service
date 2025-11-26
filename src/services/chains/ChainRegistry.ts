import {
  ChainType,
  TransactionDetailInput,
  NetworkTransactionInfo,
} from '../../types';
import { IChainHandler } from './IChainHandler';
import { getChainType } from '../../config';
import { logger } from '../../utils/logger';

class ChainRegistry {
  private handlers: Map<ChainType, IChainHandler> = new Map();

  registerHandler(chainType: ChainType, handler: IChainHandler): void {
    this.handlers.set(chainType, handler);
    logger.info(`Registered handler for ${chainType}`);
  }

  async getTransactionInfo(
    input: TransactionDetailInput,
  ): Promise<NetworkTransactionInfo> {
    const chainType = input.chainType || getChainType(input.networkId);

    logger.debug('Getting transaction info', {
      txHash: input.txHash,
      networkId: input.networkId,
      chainType,
    });

    const handler = this.handlers.get(chainType);
    if (!handler) {
      throw new Error(`No handler registered for chain type: ${chainType}`);
    }

    return handler.getTransactionInfo(input);
  }

  getHandler(chainType: ChainType): IChainHandler | undefined {
    return this.handlers.get(chainType);
  }
}

export const chainRegistry = new ChainRegistry();
