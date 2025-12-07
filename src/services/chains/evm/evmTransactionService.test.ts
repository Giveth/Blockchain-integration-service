import { expect } from 'chai';
import {
  evmTransactionService,
  DonationTransferInfo,
} from './evmTransactionService';

describe('EvmTransactionService', () => {
  describe('findDonationTransfer', () => {
    const sampleTransfers: DonationTransferInfo[] = [
      {
        from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
        to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
        amount: BigInt('170548695000000000000'), // 170.548695 tokens
        tokenAddress: '0xc7B1807822160a8C5b6c9EaF5C584aAD0972deeC',
        isNativeToken: false,
      },
      {
        from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
        to: '0xd10BAC02af78E1626',
        amount: BigInt('284247825000000000000'), // 284.247825 tokens
        tokenAddress: '0xc7B1807822160a8C5b6c9EaF5C584aAD0972deeC',
        isNativeToken: false,
      },
      {
        from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
        to: '0xD9B227568851D85ea',
        amount: BigInt('910009520000000000000'), // 910.00952 tokens
        tokenAddress: '0xc7B1807822160a8C5b6c9EaF5C584aAD0972deeC',
        isNativeToken: false,
      },
    ];

    const sampleNativeTransfers: DonationTransferInfo[] = [
      {
        from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
        to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
        amount: BigInt('1000000000000000000'), // 1 MATIC
        tokenAddress: '0x0000000000000000000000000000000000000000',
        isNativeToken: true,
      },
      {
        from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
        to: '0xABC123456789DEF0123456789ABC123456789DEF0',
        amount: BigInt('2500000000000000000'), // 2.5 MATIC
        tokenAddress: '0x0000000000000000000000000000000000000000',
        isNativeToken: true,
      },
    ];

    it('should find transfer to recipient address', () => {
      const result = evmTransactionService.findDonationTransfer(
        sampleTransfers,
        '0xd7095B0618609feF9e542D5A1D320502C8544D10',
      );

      expect(result).to.not.be.null;
      expect(result!.to.toLowerCase()).to.equal(
        '0xd7095B0618609feF9e542D5A1D320502C8544D10'.toLowerCase(),
      );
      expect(result!.amount).to.equal(BigInt('170548695000000000000'));
    });

    it('should be case-insensitive for address matching', () => {
      const result = evmTransactionService.findDonationTransfer(
        sampleTransfers,
        '0xD7095B0618609FEF9E542D5A1D320502C8544D10', // uppercase
      );

      expect(result).to.not.be.null;
      expect(result!.to.toLowerCase()).to.equal(
        '0xd7095b0618609fef9e542d5a1d320502c8544d10',
      );
    });

    it('should return null if no transfer to recipient', () => {
      const result = evmTransactionService.findDonationTransfer(
        sampleTransfers,
        '0x0000000000000000000000000000000000000000',
      );

      expect(result).to.be.null;
    });

    it('should find transfer with closest amount when multiple transfers to same recipient', () => {
      const multipleToSameRecipient: DonationTransferInfo[] = [
        {
          from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('100000000000000000000'), // 100 tokens
          tokenAddress: '0xc7B1807822160a8C5b6c9EaF5C584aAD0972deeC',
        },
        {
          from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('200000000000000000000'), // 200 tokens
          tokenAddress: '0xc7B1807822160a8C5b6c9EaF5C584aAD0972deeC',
        },
      ];

      // Look for ~200 tokens
      const result = evmTransactionService.findDonationTransfer(
        multipleToSameRecipient,
        '0xd7095B0618609feF9e542D5A1D320502C8544D10',
        200, // expected amount
      );

      expect(result).to.not.be.null;
      expect(result!.amount).to.equal(BigInt('200000000000000000000'));
    });

    it('should return first transfer if no amount specified and multiple transfers to same recipient', () => {
      const multipleToSameRecipient: DonationTransferInfo[] = [
        {
          from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('100000000000000000000'), // 100 tokens
          tokenAddress: '0xc7B1807822160a8C5b6c9EaF5C584aAD0972deeC',
        },
        {
          from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('200000000000000000000'), // 200 tokens
          tokenAddress: '0xc7B1807822160a8C5b6c9EaF5C584aAD0972deeC',
        },
      ];

      const result = evmTransactionService.findDonationTransfer(
        multipleToSameRecipient,
        '0xd7095B0618609feF9e542D5A1D320502C8544D10',
      );

      expect(result).to.not.be.null;
      // Returns first one when no amount specified
      expect(result!.amount).to.equal(BigInt('100000000000000000000'));
    });

    it('should find native token transfer to recipient', () => {
      const result = evmTransactionService.findDonationTransfer(
        sampleNativeTransfers,
        '0xd7095B0618609feF9e542D5A1D320502C8544D10',
      );

      expect(result).to.not.be.null;
      expect(result!.to.toLowerCase()).to.equal(
        '0xd7095b0618609fef9e542d5a1d320502c8544d10',
      );
      expect(result!.amount).to.equal(BigInt('1000000000000000000'));
      expect(result!.isNativeToken).to.be.true;
      expect(result!.tokenAddress).to.equal(
        '0x0000000000000000000000000000000000000000',
      );
    });

    it('should distinguish between native and ERC-20 transfers', () => {
      const mixedTransfers: DonationTransferInfo[] = [
        ...sampleTransfers,
        ...sampleNativeTransfers,
      ];

      // Find all transfers to the same recipient
      const recipient = '0xd7095B0618609feF9e542D5A1D320502C8544D10';

      // Should find ERC-20 transfer first (it's first in the array)
      const result = evmTransactionService.findDonationTransfer(
        mixedTransfers,
        recipient,
      );

      expect(result).to.not.be.null;
      expect(result!.isNativeToken).to.be.false;

      // Filter for only native transfers
      const nativeOnly = mixedTransfers.filter((t) => t.isNativeToken);
      const nativeResult = evmTransactionService.findDonationTransfer(
        nativeOnly,
        recipient,
      );

      expect(nativeResult).to.not.be.null;
      expect(nativeResult!.isNativeToken).to.be.true;
    });
  });

  describe('isSupported', () => {
    it('should return true for EVM networks', () => {
      expect(evmTransactionService.isSupported(1)).to.be.true; // Mainnet
      expect(evmTransactionService.isSupported(137)).to.be.true; // Polygon
      expect(evmTransactionService.isSupported(10)).to.be.true; // Optimism
    });

    it('should return false for non-EVM networks', () => {
      expect(evmTransactionService.isSupported(101)).to.be.false; // Solana
      expect(evmTransactionService.isSupported(999999)).to.be.false; // Unknown
    });
  });
});
