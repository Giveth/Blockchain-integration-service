import { expect } from 'chai';
import {
  closeTo,
  isValidEthereumAddress,
  isValidEvmTransactionHash,
  isValidSolanaAddress,
  isValidSolanaSignature,
  normalizeAddress,
  isTimestampValid,
} from './validation';

describe('Validation Utils', () => {
  describe('closeTo', () => {
    it('should return true for equal numbers', () => {
      expect(closeTo(1.0, 1.0)).to.be.true;
    });

    it('should return true for numbers within delta', () => {
      expect(closeTo(1.0, 1.0009, 0.001)).to.be.true;
    });

    it('should return false for numbers outside delta', () => {
      expect(closeTo(1.0, 1.1, 0.001)).to.be.false;
    });

    it('should handle zero values', () => {
      expect(closeTo(0, 0)).to.be.true;
      expect(closeTo(0, 1)).to.be.false;
    });
  });

  describe('isValidEthereumAddress', () => {
    it('should validate correct Ethereum addresses', () => {
      expect(
        isValidEthereumAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
      ).to.be.false; // Wrong length
      expect(
        isValidEthereumAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'),
      ).to.be.true;
    });

    it('should reject invalid addresses', () => {
      expect(isValidEthereumAddress('invalid')).to.be.false;
      expect(isValidEthereumAddress('0x123')).to.be.false;
      expect(isValidEthereumAddress('')).to.be.false;
    });
  });

  describe('isValidEvmTransactionHash', () => {
    it('should validate correct transaction hashes', () => {
      expect(
        isValidEvmTransactionHash(
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ),
      ).to.be.true;
    });

    it('should reject invalid hashes', () => {
      expect(isValidEvmTransactionHash('0x123')).to.be.false;
      expect(isValidEvmTransactionHash('invalid')).to.be.false;
      expect(isValidEvmTransactionHash('')).to.be.false;
    });
  });

  describe('isValidSolanaAddress', () => {
    it('should validate correct Solana addresses', () => {
      expect(isValidSolanaAddress('11111111111111111111111111111111')).to.be
        .true;
      expect(
        isValidSolanaAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      ).to.be.true;
    });

    it('should reject invalid addresses', () => {
      expect(isValidSolanaAddress('invalid')).to.be.false;
      expect(isValidSolanaAddress('0x123')).to.be.false;
      expect(isValidSolanaAddress('')).to.be.false;
    });
  });

  describe('isValidSolanaSignature', () => {
    it('should validate correct Solana signatures', () => {
      // Valid 88-character base58 Solana signature (base58 excludes 0, O, I, l)
      const validSignature =
        '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d1wYmPYxKFPkcfUxZH9bpCfp4BTZrwPFcP2kRF4cJCeW9';
      expect(isValidSolanaSignature(validSignature)).to.be.true;
    });

    it('should reject invalid signatures', () => {
      expect(isValidSolanaSignature('invalid')).to.be.false;
      expect(isValidSolanaSignature('0x123')).to.be.false;
      expect(isValidSolanaSignature('')).to.be.false;
    });
  });

  describe('normalizeAddress', () => {
    it('should convert to lowercase', () => {
      expect(normalizeAddress('0xABC123')).to.equal('0xabc123');
    });

    it('should trim whitespace', () => {
      expect(normalizeAddress('  0xabc123  ')).to.equal('0xabc123');
    });
  });

  describe('isTimestampValid', () => {
    it('should return true for timestamps within threshold', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now - 100, now, 3600)).to.be.true;
    });

    it('should return false for timestamps outside threshold', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now - 7200, now, 3600)).to.be.false;
    });

    it('should handle custom thresholds', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now - 100, now, 50)).to.be.false;
      expect(isTimestampValid(now - 30, now, 50)).to.be.true;
    });
  });
});
