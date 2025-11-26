import { expect } from 'chai';
import { chainRegistry } from './ChainRegistry';
import { ChainType, TransactionDetailInput } from '../../types';
import { IChainHandler } from './IChainHandler';

describe('ChainRegistry', () => {
  const mockHandler: IChainHandler = {
    async getTransactionInfo(input: TransactionDetailInput) {
      return {
        hash: input.txHash,
        amount: input.amount,
        from: input.fromAddress,
        to: input.toAddress,
        currency: input.symbol,
        timestamp: input.timestamp,
        status: 'SUCCESS' as any,
      };
    },
    isSupported(networkId: number) {
      return networkId === 999;
    },
  };

  describe('registerHandler', () => {
    it('should register a new chain handler', () => {
      chainRegistry.registerHandler(ChainType.EVM, mockHandler);
      const handler = chainRegistry.getHandler(ChainType.EVM);
      expect(handler).to.exist;
    });
  });

  describe('getHandler', () => {
    it('should return registered handler', () => {
      chainRegistry.registerHandler(ChainType.EVM, mockHandler);
      const handler = chainRegistry.getHandler(ChainType.EVM);
      expect(handler).to.equal(mockHandler);
    });

    it('should return undefined for unregistered chain', () => {
      const handler = chainRegistry.getHandler('UNKNOWN' as any);
      expect(handler).to.be.undefined;
    });
  });

  describe('getTransactionInfo', () => {
    it('should use correct handler for chain type', async () => {
      chainRegistry.registerHandler(ChainType.EVM, mockHandler);

      const input: TransactionDetailInput = {
        txHash: '0x123',
        networkId: 1,
        symbol: 'ETH',
        fromAddress: '0xfrom',
        toAddress: '0xto',
        amount: 1.0,
        timestamp: Date.now(),
        chainType: ChainType.EVM,
      };

      const result = await chainRegistry.getTransactionInfo(input);
      expect(result.hash).to.equal(input.txHash);
      expect(result.amount).to.equal(input.amount);
    });

    it('should throw error for unregistered chain type', async () => {
      const input: TransactionDetailInput = {
        txHash: '0x123',
        networkId: 99999,
        symbol: 'UNKNOWN',
        fromAddress: '0xfrom',
        toAddress: '0xto',
        amount: 1.0,
        timestamp: Date.now(),
      };

      try {
        await chainRegistry.getTransactionInfo(input);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
});
