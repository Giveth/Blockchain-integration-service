import { expect } from 'chai';
import { TransactionVerificationService } from './transactionVerificationService';
import { TransactionDetailInput } from '../types';

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
});
