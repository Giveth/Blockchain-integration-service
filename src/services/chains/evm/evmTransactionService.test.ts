import { expect } from 'chai';
import sinon from 'sinon';
import { ethers } from 'ethers';
import {
  evmTransactionService,
  DonationTransferInfo,
} from './evmTransactionService';

// Transfer event topic
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const DONATION_MADE_TOPIC =
  '0x428e1190dfef997f3ac8da6afa80e330fc785bafb1febed9109598bfeee45ec0';

describe('EvmTransactionService', () => {
  const providers = (
    evmTransactionService as unknown as { providers: Map<number, unknown> }
  ).providers;

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

    it('should match expected amount using 6 decimals (e.g. USDC)', () => {
      // USDC has 6 decimals: 1.25 USDC = 1_250_000 raw
      const usdcTransfers: DonationTransferInfo[] = [
        {
          from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('1250000'), // 1.25 USDC
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          isNativeToken: false,
        },
        {
          from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('100000000'), // 100 USDC
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          isNativeToken: false,
        },
      ];

      const result = evmTransactionService.findDonationTransfer(
        usdcTransfers,
        '0xd7095B0618609feF9e542D5A1D320502C8544D10',
        1.25, // expected normalized amount
        6, // USDC decimals
      );

      expect(result).to.not.be.null;
      expect(result!.amount).to.equal(BigInt('1250000'));
    });

    it('should not use 18 decimals for 6-decimal token (wrong decimals pick wrong transfer)', () => {
      // Two USDC transfers. With 6 decimals, expected 100 matches 100 USDC. With 18 decimals, no match so first is returned.
      const usdcTransfers: DonationTransferInfo[] = [
        {
          from: '0xA',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('1250000'), // 1.25 USDC
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          isNativeToken: false,
        },
        {
          from: '0xA',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('100000000'), // 100 USDC
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          isNativeToken: false,
        },
      ];

      const with6 = evmTransactionService.findDonationTransfer(
        usdcTransfers,
        '0xd7095B0618609feF9e542D5A1D320502C8544D10',
        100, // expect 100 USDC
        6,
      );
      const with18 = evmTransactionService.findDonationTransfer(
        usdcTransfers,
        '0xd7095B0618609feF9e542D5A1D320502C8544D10',
        100, // with 18 decimals this becomes 100e18, no transfer matches
        18,
      );

      expect(with6).to.not.be.null;
      expect(with6!.amount).to.equal(BigInt('100000000')); // correct: 100 USDC
      expect(with18).to.not.be.null;
      expect(with18!.amount).to.equal(BigInt('1250000')); // wrong: returned first because 18-decimal match failed
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

  describe('getTransactionInfo (direct ERC-20)', () => {
    const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const RECIPIENT = '0xd7095B0618609feF9e542D5A1D320502C8544D10';
    const SENDER = '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3';
    const TX_HASH =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    it('should return normalized on-chain amount for direct ERC-20, not echo input.amount', async () => {
      // Build a Transfer log: 1.25 USDC = 1250000 raw (6 decimals)
      const amountRaw = ethers.BigNumber.from('1250000');
      const log: ethers.providers.Log = {
        address: USDC_ADDRESS,
        blockHash:
          '0xabcd000000000000000000000000000000000000000000000000000000000000',
        blockNumber: 12345,
        data: '0x' + amountRaw.toHexString().slice(2).padStart(64, '0'),
        logIndex: 0,
        removed: false,
        topics: [
          TRANSFER_TOPIC,
          '0x000000000000000000000000' + SENDER.slice(2).toLowerCase(),
          '0x000000000000000000000000' + RECIPIENT.slice(2).toLowerCase(),
        ],
        transactionHash: TX_HASH,
        transactionIndex: 0,
      };

      const txResponse = {
        hash: TX_HASH,
        from: SENDER,
        to: '0xSomeOtherContract',
        value: ethers.BigNumber.from(0),
        nonce: 0,
        blockNumber: 12345,
        gasPrice: ethers.BigNumber.from(1),
      };
      const receipt = {
        status: 1,
        blockNumber: 12345,
        gasUsed: ethers.BigNumber.from(21000),
        logs: [log],
      };
      const block = { timestamp: 1600000000 };

      const fakeProvider = {
        getTransaction: sinon.stub().resolves(txResponse),
        getTransactionReceipt: sinon.stub().resolves(receipt),
        getBlock: sinon.stub().resolves(block),
      };

      const getTokenDecimalsStub = sinon
        .stub(evmTransactionService, 'getTokenDecimals')
        .resolves(6);

      providers.set(1, fakeProvider);

      try {
        const result = await evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 1,
          symbol: 'USDC',
          fromAddress: SENDER,
          toAddress: RECIPIENT,
          amount: 999, // caller sends wrong amount; response must not echo this
          timestamp: 1600000000,
          tokenAddress: USDC_ADDRESS,
        });

        expect(result.amount).to.equal(1.25);
        expect(result.amount).to.not.equal(999);
      } finally {
        getTokenDecimalsStub.restore();
        providers.delete(1);
      }
    });
  });

  describe('getTransactionInfo (Safe donation handler)', () => {
    const SAFE_ADDRESS = '0x1111111111111111111111111111111111111111';
    const EXECUTOR_ADDRESS = '0x2222222222222222222222222222222222222222';
    const RECIPIENT = '0x3333333333333333333333333333333333333333';
    const DONATION_HANDLER = '0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676';
    const TX_HASH =
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';

    it('should attribute donation handler transfers to the Safe account', async () => {
      const amountRaw = ethers.utils.parseUnits('1.5', 18);
      const donationLog: ethers.providers.Log = {
        address: DONATION_HANDLER,
        blockHash:
          '0xabcd000000000000000000000000000000000000000000000000000000000000',
        blockNumber: 12345,
        data: '0x' + amountRaw.toHexString().slice(2).padStart(64, '0'),
        logIndex: 0,
        removed: false,
        topics: [
          DONATION_MADE_TOPIC,
          '0x000000000000000000000000' + RECIPIENT.slice(2).toLowerCase(),
          '0x000000000000000000000000' + '0'.repeat(40),
        ],
        transactionHash: TX_HASH,
        transactionIndex: 0,
      };

      const txResponse = {
        hash: TX_HASH,
        from: EXECUTOR_ADDRESS,
        to: SAFE_ADDRESS,
        value: ethers.BigNumber.from(0),
        nonce: 7,
        blockNumber: 12345,
        gasPrice: ethers.BigNumber.from(1),
      };
      const receipt = {
        status: 1,
        blockNumber: 12345,
        gasUsed: ethers.BigNumber.from(21000),
        logs: [donationLog],
      };
      const block = { timestamp: 1600000000 };

      const fakeProvider = {
        getTransaction: sinon.stub().resolves(txResponse),
        getTransactionReceipt: sinon.stub().resolves(receipt),
        getBlock: sinon.stub().resolves(block),
      };

      providers.set(100, fakeProvider);

      try {
        const result = await evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          safeTxHash:
            '0x9999999999999999999999999999999999999999999999999999999999999999',
          networkId: 100,
          symbol: 'XDAI',
          fromAddress: SAFE_ADDRESS,
          toAddress: RECIPIENT,
          amount: 1.5,
          timestamp: 1600000000,
        });

        expect(result.from).to.equal(SAFE_ADDRESS);
        expect(result.to).to.equal(RECIPIENT);
        expect(result.amount).to.equal(1.5);
      } finally {
        providers.delete(100);
      }
    });
  });
});
