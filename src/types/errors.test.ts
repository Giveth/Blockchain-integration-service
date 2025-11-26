import { expect } from 'chai';
import { BlockchainError, BlockchainErrorCode } from './errors';

describe('BlockchainError', () => {
  describe('constructor', () => {
    it('should create error with code and message', () => {
      const error = new BlockchainError(
        BlockchainErrorCode.TRANSACTION_NOT_FOUND,
        'Transaction not found',
      );

      expect(error.code).to.equal(BlockchainErrorCode.TRANSACTION_NOT_FOUND);
      expect(error.message).to.equal('Transaction not found');
      expect(error.name).to.equal('BlockchainError');
    });

    it('should create error with details', () => {
      const details = { txHash: '0x123', networkId: 1 };
      const error = new BlockchainError(
        BlockchainErrorCode.TRANSACTION_NOT_FOUND,
        'Transaction not found',
        details,
      );

      expect(error.details).to.deep.equal(details);
    });

    it('should be instance of Error', () => {
      const error = new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        'Network error',
      );

      expect(error).to.be.instanceOf(Error);
      expect(error).to.be.instanceOf(BlockchainError);
    });

    it('should have stack trace', () => {
      const error = new BlockchainError(
        BlockchainErrorCode.NETWORK_ERROR,
        'Network error',
      );

      expect(error.stack).to.exist;
      expect(error.stack).to.include('BlockchainError');
    });
  });

  describe('Error Codes', () => {
    it('should have all expected error codes', () => {
      expect(BlockchainErrorCode.TRANSACTION_NOT_FOUND).to.equal(
        'TRANSACTION_NOT_FOUND',
      );
      expect(BlockchainErrorCode.TRANSACTION_FAILED).to.equal(
        'TRANSACTION_FAILED',
      );
      expect(BlockchainErrorCode.INVALID_NETWORK_ID).to.equal(
        'INVALID_NETWORK_ID',
      );
      expect(BlockchainErrorCode.INVALID_TRANSACTION_HASH).to.equal(
        'INVALID_TRANSACTION_HASH',
      );
      expect(BlockchainErrorCode.FROM_ADDRESS_MISMATCH).to.equal(
        'FROM_ADDRESS_MISMATCH',
      );
      expect(BlockchainErrorCode.TO_ADDRESS_MISMATCH).to.equal(
        'TO_ADDRESS_MISMATCH',
      );
      expect(BlockchainErrorCode.AMOUNT_MISMATCH).to.equal('AMOUNT_MISMATCH');
      expect(BlockchainErrorCode.TIMESTAMP_TOO_OLD).to.equal(
        'TIMESTAMP_TOO_OLD',
      );
      expect(BlockchainErrorCode.NETWORK_ERROR).to.equal('NETWORK_ERROR');
      expect(BlockchainErrorCode.PROVIDER_ERROR).to.equal('PROVIDER_ERROR');
    });
  });

  describe('Error Handling', () => {
    it('should be catchable', () => {
      try {
        throw new BlockchainError(
          BlockchainErrorCode.NETWORK_ERROR,
          'Network error',
        );
      } catch (error) {
        expect(error).to.be.instanceOf(BlockchainError);
        if (error instanceof BlockchainError) {
          expect(error.code).to.equal(BlockchainErrorCode.NETWORK_ERROR);
        }
      }
    });

    it('should preserve error message in catch', () => {
      const originalMessage = 'Custom error message';
      try {
        throw new BlockchainError(
          BlockchainErrorCode.AMOUNT_MISMATCH,
          originalMessage,
        );
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).to.equal(originalMessage);
        }
      }
    });
  });
});
