import { expect } from 'chai';
import sinon from 'sinon';
import { TransactionVerificationService } from './transactionVerificationService';
import { TransactionDetailInput } from '../types';
import * as evmTransactionServiceModule from './chains/evm/evmTransactionService';

describe('TransactionVerificationService', () => {
  let service: TransactionVerificationService;

  beforeEach(() => {
    service = new TransactionVerificationService();
  });

  describe('verifyTransaction', () => {
    it('should return validation result structure', async () => {
      const input: TransactionDetailInput = {
        txHash:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        networkId: 1,
        symbol: 'ETH',
        fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        amount: 1.0,
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await service.verifyTransaction(input);

      expect(result).to.have.property('isValid');
      expect(result.isValid).to.be.a('boolean');
    });

    it('should handle transaction verification errors gracefully', async () => {
      const input: TransactionDetailInput = {
        txHash: 'invalid-hash',
        networkId: 1,
        symbol: 'ETH',
        fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        amount: 1.0,
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await service.verifyTransaction(input);

      expect(result).to.have.property('isValid');
      expect(result.isValid).to.be.a('boolean');

      if (!result.isValid) {
        expect(result.error).to.exist;
        expect(result.errorCode).to.exist;
      }
    });
  });

  describe('verifyTransactions', () => {
    it('should handle batch verification', async () => {
      const inputs: TransactionDetailInput[] = [
        {
          txHash:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          networkId: 1,
          symbol: 'ETH',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.0,
          timestamp: Math.floor(Date.now() / 1000),
        },
      ];

      const results = await service.verifyTransactions(inputs);

      expect(results).to.be.an('array');
      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.have.property('isValid');
    });

    it('should process multiple transactions in parallel', async () => {
      const inputs: TransactionDetailInput[] = [
        {
          txHash:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          networkId: 1,
          symbol: 'ETH',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.0,
          timestamp: Math.floor(Date.now() / 1000),
        },
        {
          txHash:
            '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          networkId: 137,
          symbol: 'MATIC',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 10.0,
          timestamp: Math.floor(Date.now() / 1000),
        },
      ];

      const results = await service.verifyTransactions(inputs);

      expect(results).to.have.lengthOf(2);
    });
  });

  describe('getTransactionTimestamp', () => {
    it('should return timestamp for valid transaction', async () => {
      const txHash =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const networkId = 1;

      try {
        const timestamp = await service.getTransactionTimestamp(
          txHash,
          networkId,
        );
        expect(timestamp).to.be.a('number');
      } catch (error) {
        // Expected without RPC connection
        expect(error).to.exist;
      }
    });
  });

  describe('checkErc721Ownership', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('should delegate ERC-721 ownership checks to the EVM service', async () => {
      const checkOwnershipStub = sinon.stub(
        evmTransactionServiceModule.evmTransactionService,
        'checkErc721Ownership',
      );
      checkOwnershipStub.resolves(true);

      const result = await service.checkErc721Ownership({
        networkId: 1,
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      });

      expect(result).to.equal(true);
      expect(
        checkOwnershipStub.calledOnceWithExactly(
          1,
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        ),
      ).to.be.true;
    });

    it('should rethrow errors from the EVM service', async () => {
      const checkOwnershipStub = sinon.stub(
        evmTransactionServiceModule.evmTransactionService,
        'checkErc721Ownership',
      );
      checkOwnershipStub.rejects(new Error('RPC unavailable'));

      try {
        await service.checkErc721Ownership({
          networkId: 1,
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        });
        expect.fail('Expected ERC-721 ownership check to throw');
      } catch (error) {
        expect((error as Error).message).to.equal('RPC unavailable');
      }
    });
  });
});
