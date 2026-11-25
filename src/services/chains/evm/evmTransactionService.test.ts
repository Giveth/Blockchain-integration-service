import { expect } from 'chai';
import sinon from 'sinon';
import { ethers } from 'ethers';
import {
  evmTransactionService,
  DonationTransferInfo,
} from './evmTransactionService';
import { getDonationHandlerAddresses } from '../../../config/donationHandlers';
import {
  BlockchainError,
  BlockchainErrorCode,
  NetworkId,
} from '../../../types';

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

    it('should match when expected amount has more fractional digits than token decimals', () => {
      const usdcTransfers: DonationTransferInfo[] = [
        {
          from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('5050343'), // 5.050343 USDC
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          isNativeToken: false,
        },
        {
          from: '0x214ED6e90C8BE22B6091775c1AA870Ac8CA1CBe3',
          to: '0xd7095B0618609feF9e542D5A1D320502C8544D10',
          amount: BigInt('10000000'), // 10 USDC
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          isNativeToken: false,
        },
      ];

      const result = evmTransactionService.findDonationTransfer(
        usdcTransfers,
        '0xd7095B0618609feF9e542D5A1D320502C8544D10',
        5.050343423352787,
        6,
      );

      expect(result).to.not.be.null;
      expect(result!.amount).to.equal(BigInt('5050343'));
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

    it('should infer Safe sender from outer Safe transaction target', async () => {
      const GIV_TOKEN = '0x4f4f9b8d5b4d0dc10506e5551b0513b61fd59e75';
      const amountRaw = ethers.utils.parseUnits('0.5', 18);
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
          '0x000000000000000000000000' + GIV_TOKEN.slice(2).toLowerCase(),
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

      const getTokenDecimalsStub = sinon
        .stub(evmTransactionService, 'getTokenDecimals')
        .resolves(18);

      providers.set(100, fakeProvider);

      try {
        const result = await evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 100,
          symbol: 'GIV',
          fromAddress: SAFE_ADDRESS,
          toAddress: RECIPIENT,
          amount: 0.5,
          timestamp: 1600000000,
          tokenAddress: GIV_TOKEN,
        });

        expect(result.from).to.equal(SAFE_ADDRESS);
        expect(result.to).to.equal(RECIPIENT);
        expect(result.amount).to.equal(0.5);
      } finally {
        getTokenDecimalsStub.restore();
        providers.delete(100);
      }
    });
  });

  describe('getTransactionInfo (sponsored donation handler)', () => {
    const RELAYER_ADDRESS = '0xB42F812A44c22cc6b861478900401ee759EbEAD6';
    const DONOR_ADDRESS = '0x65279542f9312620a67469b042a8bb6851904442';
    const RECIPIENT = '0x4d9339dd97db55e3b9bcbe65de39ff9c04d1c2cd';
    const DONATION_HANDLER = '0x4102E15f4621Fc45fCe8E07442A702BD49fcea4b';
    const USDC_ADDRESS = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
    const TX_HASH =
      '0xf2f47c7c977933f08e57c13323b3f53d5ab65e6e132f626b9aba9ae635532f76';

    it('should attribute ERC-20 donation handler events to the funding transfer sender', async () => {
      const donationAmountRaw = ethers.utils.parseUnits('1', 6);
      const fundingAmountRaw = ethers.utils.parseUnits('11', 6);
      const donationLog: ethers.providers.Log = {
        address: DONATION_HANDLER,
        blockHash:
          '0xabcd000000000000000000000000000000000000000000000000000000000000',
        blockNumber: 12345,
        data: '0x' + donationAmountRaw.toHexString().slice(2).padStart(64, '0'),
        logIndex: 0,
        removed: false,
        topics: [
          DONATION_MADE_TOPIC,
          '0x000000000000000000000000' + RECIPIENT.slice(2).toLowerCase(),
          '0x000000000000000000000000' + USDC_ADDRESS.slice(2).toLowerCase(),
        ],
        transactionHash: TX_HASH,
        transactionIndex: 0,
      };
      const fundingTransferLog: ethers.providers.Log = {
        address: USDC_ADDRESS,
        blockHash:
          '0xabcd000000000000000000000000000000000000000000000000000000000000',
        blockNumber: 12345,
        data: '0x' + fundingAmountRaw.toHexString().slice(2).padStart(64, '0'),
        logIndex: 1,
        removed: false,
        topics: [
          TRANSFER_TOPIC,
          '0x000000000000000000000000' + DONOR_ADDRESS.slice(2).toLowerCase(),
          '0x000000000000000000000000' +
            DONATION_HANDLER.slice(2).toLowerCase(),
        ],
        transactionHash: TX_HASH,
        transactionIndex: 0,
      };

      const txResponse = {
        hash: TX_HASH,
        from: RELAYER_ADDRESS,
        to: DONATION_HANDLER,
        value: ethers.BigNumber.from(0),
        nonce: 10,
        blockNumber: 12345,
        gasPrice: ethers.BigNumber.from(1),
      };
      const receipt = {
        status: 1,
        blockNumber: 12345,
        gasUsed: ethers.BigNumber.from(21000),
        logs: [donationLog, fundingTransferLog],
      };
      const block = { timestamp: 1777305051 };

      const fakeProvider = {
        getTransaction: sinon.stub().resolves(txResponse),
        getTransactionReceipt: sinon.stub().resolves(receipt),
        getBlock: sinon.stub().resolves(block),
      };

      const getTokenDecimalsStub = sinon
        .stub(evmTransactionService, 'getTokenDecimals')
        .resolves(6);
      const getTokenSymbolStub = sinon
        .stub(evmTransactionService, 'getTokenSymbol')
        .resolves('USDC');

      providers.set(137, fakeProvider);

      try {
        const result = await evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 137,
          symbol: 'USDC',
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT,
          amount: 1,
          timestamp: 1777305051,
          tokenAddress: USDC_ADDRESS,
        });

        expect(result.from.toLowerCase()).to.equal(DONOR_ADDRESS.toLowerCase());
        expect(result.from.toLowerCase()).to.not.equal(
          RELAYER_ADDRESS.toLowerCase(),
        );
        expect(result.to.toLowerCase()).to.equal(RECIPIENT.toLowerCase());
        expect(result.amount).to.equal(1);
      } finally {
        getTokenDecimalsStub.restore();
        getTokenSymbolStub.restore();
        providers.delete(137);
      }
    });
    it('attributes the donation when the claim is within tolerance above the on-chain amount', async () => {
      const amountRaw = ethers.utils.parseUnits('1', 6);
      const word = '0x' + amountRaw.toHexString().slice(2).padStart(64, '0');
      const topic = (address: string) =>
        '0x000000000000000000000000' + address.slice(2).toLowerCase();
      const base = {
        blockHash:
          '0xabcd000000000000000000000000000000000000000000000000000000000000',
        blockNumber: 12345,
        removed: false,
        transactionHash: TX_HASH,
        transactionIndex: 0,
      };
      const fakeProvider = {
        getTransaction: sinon.stub().resolves({
          hash: TX_HASH,
          from: RELAYER_ADDRESS,
          to: DONATION_HANDLER,
          value: ethers.BigNumber.from(0),
          nonce: 10,
          blockNumber: 12345,
          gasPrice: ethers.BigNumber.from(1),
        }),
        getTransactionReceipt: sinon.stub().resolves({
          status: 1,
          blockNumber: 12345,
          gasUsed: ethers.BigNumber.from(21000),
          logs: [
            {
              ...base,
              address: USDC_ADDRESS,
              data: word,
              logIndex: 0,
              topics: [
                TRANSFER_TOPIC,
                topic(DONOR_ADDRESS),
                topic(DONATION_HANDLER),
              ],
            },
            {
              ...base,
              address: DONATION_HANDLER,
              data: word,
              logIndex: 1,
              topics: [
                DONATION_MADE_TOPIC,
                topic(RECIPIENT),
                topic(USDC_ADDRESS),
              ],
            },
          ],
        }),
        getBlock: sinon.stub().resolves({ timestamp: 1777305051 }),
      };
      const decimalsStub = sinon
        .stub(evmTransactionService, 'getTokenDecimals')
        .resolves(6);
      const symbolStub = sinon
        .stub(evmTransactionService, 'getTokenSymbol')
        .resolves('USDC');
      providers.set(137, fakeProvider);
      try {
        // The donor funded exactly 1 USDC; the claim is 1.005 (within 1%).
        const result = await evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 137,
          symbol: 'USDC',
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT,
          amount: 1.005,
          timestamp: 1777305051,
          tokenAddress: USDC_ADDRESS,
        });
        expect(result.from.toLowerCase()).to.equal(DONOR_ADDRESS.toLowerCase());
      } finally {
        decimalsStub.restore();
        symbolStub.restore();
        providers.delete(137);
      }
    });
  });

  // Mirrors Arbitrum tx 0xce56da76…5f13 (prod donations 238765922/3): a
  // relayer submits for an EIP-7702 donor and the handler moves USDT straight
  // from the donor to each recipient, so no Transfer goes to the handler.
  describe('getTransactionInfo (relayed EIP-7702 donation handler)', () => {
    const RELAYER_ADDRESS = '0xb42f812a44c22cc6b861478900401ee759ebead6';
    const RELAY_CONTRACT = '0xdb9b1e94b5b69df7e401ddbede43491141047db3';
    const DONOR_ADDRESS = '0xd95fa7f4a3a1a0abaf1f97ae9ea02d75b2134f3b';
    const RECIPIENT_A = '0xaab3590a496cf01dc5246a6f69d2bd245775eeb2';
    const RECIPIENT_B = '0x4d9339dd97db55e3b9bcbe65de39ff9c04d1c2cd';
    const RELAYER_FEE_RECEIVER = '0xe3478b0bb1a5084567c319096437924948be1964';
    const USDT_ADDRESS = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
    const TX_HASH =
      '0xce56da769548d256b02a1b226756bf5477a6a5432c4646e77cb99debaca35f13';
    const pad = (address: string) =>
      '0x000000000000000000000000' + address.slice(2).toLowerCase();
    const uint = (value: ethers.BigNumber) =>
      '0x' + value.toHexString().slice(2).padStart(64, '0');

    let logIndex = 0;
    const makeLog = (
      address: string,
      topics: string[],
      data: string,
    ): ethers.providers.Log => ({
      address,
      blockHash:
        '0x7dc31058c9f98053dd6946b71b4c70808e18fd6b964b380ed77caf615bc89765',
      blockNumber: 526261453,
      data,
      logIndex: logIndex++,
      removed: false,
      topics,
      transactionHash: TX_HASH,
      transactionIndex: 2,
    });

    const runVerification = async (params: {
      fromAddress: string;
      toAddress: string;
      amount: number;
      // Overrides for the donor -> RECIPIENT_A Transfer (negative cases).
      recipientATransfer?: { token?: string; value?: ethers.BigNumber };
    }) => {
      const { recipientATransfer, ...input } = params;
      logIndex = 0;
      const handler = getDonationHandlerAddresses(NetworkId.ARBITRUM)[0];
      const tenUsdt = ethers.utils.parseUnits('10', 6);
      const oneUsdt = ethers.utils.parseUnits('1', 6);
      const transfer = (
        to: string,
        value: ethers.BigNumber,
        token: string = USDT_ADDRESS,
      ) =>
        makeLog(
          token,
          [TRANSFER_TOPIC, pad(DONOR_ADDRESS), pad(to)],
          uint(value),
        );
      const donationMade = (to: string, value: ethers.BigNumber) =>
        makeLog(
          handler,
          [DONATION_MADE_TOPIC, pad(to), pad(USDT_ADDRESS)],
          uint(value) +
            '0000000000000000000000000000000000000000000000000000000000000040' +
            '0000000000000000000000000000000000000000000000000000000000000000',
        );
      const receipt = {
        status: 1,
        blockNumber: 526261453,
        gasUsed: ethers.BigNumber.from(315789),
        logs: [
          transfer(
            RECIPIENT_A,
            recipientATransfer?.value ?? tenUsdt,
            recipientATransfer?.token,
          ),
          donationMade(RECIPIENT_A, tenUsdt),
          transfer(RECIPIENT_B, oneUsdt),
          donationMade(RECIPIENT_B, oneUsdt),
          transfer(RELAYER_FEE_RECEIVER, ethers.BigNumber.from(18956)),
        ],
      };
      const fakeProvider = {
        getTransaction: sinon.stub().resolves({
          hash: TX_HASH,
          from: RELAYER_ADDRESS,
          to: RELAY_CONTRACT,
          value: ethers.BigNumber.from(0),
          nonce: 382297,
          blockNumber: 526261453,
          gasPrice: ethers.BigNumber.from(20116001),
        }),
        getTransactionReceipt: sinon.stub().resolves(receipt),
        getBlock: sinon.stub().resolves({ timestamp: 1795269063 }),
      };
      const decimalsStub = sinon
        .stub(evmTransactionService, 'getTokenDecimals')
        .resolves(6);
      const symbolStub = sinon
        .stub(evmTransactionService, 'getTokenSymbol')
        .resolves('USDT');
      providers.set(NetworkId.ARBITRUM, fakeProvider);
      try {
        return await evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: NetworkId.ARBITRUM,
          symbol: 'USDT',
          tokenAddress: USDT_ADDRESS,
          timestamp: 1795269063,
          ...input,
        });
      } finally {
        decimalsStub.restore();
        symbolStub.restore();
        providers.delete(NetworkId.ARBITRUM);
      }
    };

    it('attributes each donation to the donor, not the relayer', async () => {
      const first = await runVerification({
        fromAddress: DONOR_ADDRESS,
        toAddress: RECIPIENT_A,
        amount: 10,
      });
      expect(first.from.toLowerCase()).to.equal(DONOR_ADDRESS);
      expect(first.to.toLowerCase()).to.equal(RECIPIENT_A);
      expect(first.amount).to.equal(10);

      const second = await runVerification({
        fromAddress: DONOR_ADDRESS,
        toAddress: RECIPIENT_B,
        amount: 1,
      });
      expect(second.from.toLowerCase()).to.equal(DONOR_ADDRESS);
      expect(second.to.toLowerCase()).to.equal(RECIPIENT_B);
      expect(second.amount).to.equal(1);
    });

    it('does not attribute the donation to a wallet that sent nothing', async () => {
      const result = await runVerification({
        fromAddress: '0x73a9b7a729dba2f5ee7b3b392d98b0a3afce6672',
        toAddress: RECIPIENT_A,
        amount: 10,
      });
      expect(result.from.toLowerCase()).to.equal(RELAYER_ADDRESS);
    });

    it('does not attribute the donation when the donor Transfer amount differs', async () => {
      const result = await runVerification({
        fromAddress: DONOR_ADDRESS,
        toAddress: RECIPIENT_A,
        amount: 10,
        recipientATransfer: { value: ethers.utils.parseUnits('9', 6) },
      });
      expect(result.from.toLowerCase()).to.equal(RELAYER_ADDRESS);
    });

    it('does not attribute the donation when the donor Transfer is another token', async () => {
      const result = await runVerification({
        fromAddress: DONOR_ADDRESS,
        toAddress: RECIPIENT_A,
        amount: 10,
        recipientATransfer: {
          token: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
      });
      expect(result.from.toLowerCase()).to.equal(RELAYER_ADDRESS);
    });

    describe('native', () => {
      const handler = getDonationHandlerAddresses(NetworkId.ARBITRUM)[0];
      const OTHER_DONOR = '0x73a9b7a729dba2f5ee7b3b392d98b0a3afce6672';
      const oneEth = ethers.utils.parseEther('1');
      const NATIVE = '0x0000000000000000000000000000000000000000';

      // One handler call per funder: the funder sends `value` into the
      // handler (behind a proxy delegatecall), which pays each recipient.
      const handlerCall = (
        from: string,
        payouts: Array<[string, ethers.BigNumber]>,
        reverted = false,
      ) => ({
        ...(reverted ? { error: 'execution reverted' } : {}),
        type: 'CALL',
        from,
        to: handler,
        value: payouts
          .reduce((sum, [, v]) => sum.add(v), ethers.BigNumber.from(0))
          .toHexString(),
        calls: [
          {
            type: 'DELEGATECALL',
            from: handler,
            to: '0x1111111111111111111111111111111111111111',
            calls: payouts.map(([to, v]) => ({
              type: 'CALL',
              from: handler,
              to,
              value: v.toHexString(),
            })),
          },
        ],
      });

      const runNative = async (params: {
        txTo?: string;
        calls: Array<ReturnType<typeof handlerCall>>;
        fromAddress: string;
        toAddress: string;
        send?: sinon.SinonStub;
      }) => {
        logIndex = 0;
        const donationLogs = params.calls.flatMap((call) =>
          call.calls[0].calls.map((payout) =>
            makeLog(
              handler,
              [DONATION_MADE_TOPIC, pad(payout.to), pad(NATIVE)],
              uint(ethers.BigNumber.from(payout.value)) +
                '0000000000000000000000000000000000000000000000000000000000000040' +
                '0000000000000000000000000000000000000000000000000000000000000000',
            ),
          ),
        );
        const send =
          params.send ??
          sinon.stub().resolves({
            type: 'CALL',
            from: RELAYER_ADDRESS,
            to: params.txTo ?? RELAY_CONTRACT,
            value: '0x0',
            calls: params.calls,
          });
        const fakeProvider = {
          getTransaction: sinon.stub().resolves({
            hash: TX_HASH,
            from: RELAYER_ADDRESS,
            to: params.txTo ?? RELAY_CONTRACT,
            value: ethers.BigNumber.from(0),
            nonce: 1,
            blockNumber: 526261453,
            gasPrice: ethers.BigNumber.from(1),
          }),
          getTransactionReceipt: sinon.stub().resolves({
            status: 1,
            blockNumber: 526261453,
            gasUsed: ethers.BigNumber.from(100000),
            logs: donationLogs,
          }),
          getBlock: sinon.stub().resolves({ timestamp: 1795269063 }),
          send,
        };
        providers.set(NetworkId.ARBITRUM, fakeProvider);
        try {
          const result = await evmTransactionService.getTransactionInfo({
            txHash: TX_HASH,
            networkId: NetworkId.ARBITRUM,
            symbol: 'ETH',
            fromAddress: params.fromAddress,
            toAddress: params.toAddress,
            amount: 1,
            timestamp: 1795269063,
          });
          return { from: result.from.toLowerCase(), send };
        } finally {
          providers.delete(NetworkId.ARBITRUM);
        }
      };

      it('credits the donor whose handler call paid this recipient', async () => {
        const { from } = await runNative({
          calls: [handlerCall(DONOR_ADDRESS, [[RECIPIENT_A, oneEth]])],
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT_A,
        });
        expect(from).to.equal(DONOR_ADDRESS);
      });

      it('never credits a wallet the trace does not show funding it', async () => {
        const { from } = await runNative({
          calls: [handlerCall(DONOR_ADDRESS, [[RECIPIENT_A, oneEth]])],
          fromAddress: OTHER_DONOR,
          toAddress: RECIPIENT_A,
        });
        expect(from).to.equal(RELAYER_ADDRESS);
      });

      it("does not let one batch donor claim another donor's donation", async () => {
        // A gives 1 ETH to P1 and B gives 1 ETH to P2 in one relayer batch;
        // A claims the P2 donation.
        const { from } = await runNative({
          calls: [
            handlerCall(DONOR_ADDRESS, [[RECIPIENT_A, oneEth]]),
            handlerCall(OTHER_DONOR, [[RECIPIENT_B, oneEth]]),
          ],
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT_B,
        });
        expect(from).to.equal(RELAYER_ADDRESS);
      });

      it('ignores a reverted handler call next to a successful one', async () => {
        // A's call to P1 reverted inside a try/catch batch; B's to P2 landed.
        const calls = [
          handlerCall(DONOR_ADDRESS, [[RECIPIENT_A, oneEth]], true),
          handlerCall(OTHER_DONOR, [[RECIPIENT_B, oneEth]]),
        ];
        const reverted = await runNative({
          calls,
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT_A,
        });
        expect(reverted.from).to.equal(RELAYER_ADDRESS);

        const landed = await runNative({
          calls,
          fromAddress: OTHER_DONOR,
          toAddress: RECIPIENT_B,
        });
        expect(landed.from).to.equal(OTHER_DONOR.toLowerCase());
      });

      it('fails as retryable when tracing times out, crediting no one', async () => {
        const timeout = Object.assign(new Error('timeout exceeded'), {
          code: 'TIMEOUT',
        });
        let error: unknown;
        try {
          await runNative({
            calls: [handlerCall(DONOR_ADDRESS, [[RECIPIENT_A, oneEth]])],
            fromAddress: DONOR_ADDRESS,
            toAddress: RECIPIENT_A,
            send: sinon.stub().rejects(timeout),
          });
        } catch (e) {
          error = e;
        }
        expect(error).to.be.instanceOf(BlockchainError);
        expect((error as BlockchainError).code).to.equal(
          BlockchainErrorCode.NETWORK_ERROR,
        );
      });

      const traceError = (message: string, extra: object = {}) =>
        Object.assign(new Error(message), extra);
      const verifyWithTraceError = (error: Error) =>
        runNative({
          calls: [handlerCall(DONOR_ADDRESS, [[RECIPIENT_A, oneEth]])],
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT_A,
          send: sinon.stub().rejects(error),
        });

      it('fails as retryable on a structured 5xx status', async () => {
        let error: unknown;
        try {
          await verifyWithTraceError(
            traceError('bad response', { code: 'SERVER_ERROR', status: 503 }),
          );
        } catch (e) {
          error = e;
        }
        expect((error as BlockchainError).code).to.equal(
          BlockchainErrorCode.NETWORK_ERROR,
        );
      });

      it('does not read a JSON-RPC request id as an HTTP status', async () => {
        // ethers embeds the request body; "id":512 is not a 5xx.
        const body =
          '{"jsonrpc":"2.0","id":512,"error":{"code":-32000,"message":"tracer rejected"}}';
        const { from } = await verifyWithTraceError(
          traceError(
            `processing response error (body=${JSON.stringify(body)}, requestBody={"id":512})`,
            { code: 'SERVER_ERROR', body },
          ),
        );
        expect(from).to.equal(RELAYER_ADDRESS);

        const unsupported = await verifyWithTraceError(
          traceError('method not found (requestBody={"id":512})', {
            code: 'SERVER_ERROR',
          }),
        );
        expect(unsupported.from).to.equal(RELAYER_ADDRESS);
      });

      it('treats a tracer execution timeout or size limit as unsupported', async () => {
        for (const message of [
          'execution timeout',
          'trace response size limit exceeded',
        ]) {
          const { from } = await verifyWithTraceError(traceError(message));
          expect(from).to.equal(RELAYER_ADDRESS);
        }
      });

      it('keeps the relayer when the RPC has no tracing methods', async () => {
        const { from } = await runNative({
          calls: [handlerCall(DONOR_ADDRESS, [[RECIPIENT_A, oneEth]])],
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT_A,
          send: sinon.stub().rejects(
            Object.assign(new Error('the method does not exist'), {
              code: -32601,
            }),
          ),
        });
        expect(from).to.equal(RELAYER_ADDRESS);
      });

      it('does not trace when the tx called the handler directly', async () => {
        const { from, send } = await runNative({
          txTo: handler,
          calls: [handlerCall(DONOR_ADDRESS, [[RECIPIENT_A, oneEth]])],
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT_A,
        });
        expect(send.called).to.equal(false);
        expect(from).to.equal(RELAYER_ADDRESS);
      });
    });
  });

  describe('getTransactionInfo (Account Abstraction donation handler)', () => {
    const ENTRYPOINT_ADDRESS = '0x5ff137d4B0fdCD49dcA30c7CF57E578a026d2789';
    const SMART_ACCOUNT = '0x501ef174B66883Ba40f92E6Fb24bfb49331D4d4C';
    const DONOR_ADDRESS = '0x1C9B282ceC2bCc27432f1F06eE2532c88634B63F';
    const RECIPIENT = '0xA743B5aC96F06da66Ca3921AAD06F2A2e040FB02';
    const DONATION_HANDLER = '0x7a5D2A00a25b95fd8739bc52Cd79f8F971C37Ca1';
    const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bDa02913';
    const TX_HASH =
      '0x375904913077bd62396d58781d69e51acaaa7c87ad9b5d87fd1630f20e5a113e';

    it('should prefer the AA transfer sender over the donation handler log sender', async () => {
      const amountRaw = ethers.utils.parseUnits('50.01', 6);
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
          '0x000000000000000000000000' + USDC_ADDRESS.slice(2).toLowerCase(),
        ],
        transactionHash: TX_HASH,
        transactionIndex: 0,
      };
      const transferLog: ethers.providers.Log = {
        address: USDC_ADDRESS,
        blockHash:
          '0xabcd000000000000000000000000000000000000000000000000000000000000',
        blockNumber: 12345,
        data: '0x' + amountRaw.toHexString().slice(2).padStart(64, '0'),
        logIndex: 1,
        removed: false,
        topics: [
          TRANSFER_TOPIC,
          '0x000000000000000000000000' + DONOR_ADDRESS.slice(2).toLowerCase(),
          '0x000000000000000000000000' + RECIPIENT.slice(2).toLowerCase(),
        ],
        transactionHash: TX_HASH,
        transactionIndex: 0,
      };

      const txResponse = {
        hash: TX_HASH,
        from: SMART_ACCOUNT,
        to: ENTRYPOINT_ADDRESS,
        value: ethers.BigNumber.from(0),
        nonce: 10,
        blockNumber: 12345,
        gasPrice: ethers.BigNumber.from(1),
      };
      const receipt = {
        status: 1,
        blockNumber: 12345,
        gasUsed: ethers.BigNumber.from(21000),
        logs: [donationLog, transferLog],
      };
      const block = { timestamp: 1777305051 };

      const fakeProvider = {
        getTransaction: sinon.stub().resolves(txResponse),
        getTransactionReceipt: sinon.stub().resolves(receipt),
        getBlock: sinon.stub().resolves(block),
      };

      const getTokenDecimalsStub = sinon
        .stub(evmTransactionService, 'getTokenDecimals')
        .resolves(6);

      providers.set(8453, fakeProvider);

      try {
        const result = await evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 8453,
          symbol: 'USDC',
          fromAddress: DONOR_ADDRESS,
          toAddress: RECIPIENT,
          amount: 50.01,
          timestamp: 1777305051,
          tokenAddress: USDC_ADDRESS,
        });

        expect(result.from.toLowerCase()).to.equal(DONOR_ADDRESS.toLowerCase());
        expect(result.from.toLowerCase()).to.not.equal(
          SMART_ACCOUNT.toLowerCase(),
        );
        expect(result.to.toLowerCase()).to.equal(RECIPIENT.toLowerCase());
        expect(result.amount).to.equal(50.01);
      } finally {
        getTokenDecimalsStub.restore();
        providers.delete(8453);
      }
    });
  });

  describe('getTransactionInfo (forged DonationMade events)', () => {
    const USER_OPERATION_EVENT_TOPIC = ethers.utils.id(
      'UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)',
    );
    const ENTRYPOINT_ADDRESS = '0x5ff137d4B0fdCD49dcA30c7CF57E578a026d2789';
    const GNOSIS_HANDLER = '0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676';
    const POLYGON_HANDLER = '0x4102E15f4621Fc45fCe8E07442A702BD49fcea4b';
    const BASE_HANDLER = '0x7a5D2A00a25b95fd8739bc52Cd79f8F971C37Ca1';
    const USDC_POLYGON = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
    const ATTACKER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const ATTACKER_CONTRACT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const PROJECT_RECIPIENT = '0xcccccccccccccccccccccccccccccccccccccccc';
    const SMART_ACCOUNT = '0xdddddddddddddddddddddddddddddddddddddddd';
    const OTHER_SMART_ACCOUNT = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const NATIVE_40 = '0'.repeat(40);
    const TX_HASH =
      '0x1234567890123456789012345678901234567890123456789012345678901234';

    const topicOf = (address: string) =>
      '0x000000000000000000000000' + address.replace(/^0x/, '').toLowerCase();

    const donationMadeLog = (params: {
      emitter: string;
      recipient: string;
      token: string;
      amountRaw: ethers.BigNumber;
      logIndex: number;
    }): ethers.providers.Log => ({
      address: params.emitter,
      blockHash:
        '0xabcd000000000000000000000000000000000000000000000000000000000000',
      blockNumber: 12345,
      data: '0x' + params.amountRaw.toHexString().slice(2).padStart(64, '0'),
      logIndex: params.logIndex,
      removed: false,
      topics: [
        DONATION_MADE_TOPIC,
        topicOf(params.recipient),
        topicOf(params.token),
      ],
      transactionHash: TX_HASH,
      transactionIndex: 0,
    });

    const userOperationEventLog = (
      sender: string,
      logIndex: number,
      emitter: string = ENTRYPOINT_ADDRESS,
    ): ethers.providers.Log => ({
      address: emitter,
      blockHash:
        '0xabcd000000000000000000000000000000000000000000000000000000000000',
      blockNumber: 12345,
      data: '0x' + '0'.repeat(64 * 4),
      logIndex,
      removed: false,
      topics: [
        USER_OPERATION_EVENT_TOPIC,
        '0x' + '1'.repeat(64),
        topicOf(sender),
        topicOf(NATIVE_40),
      ],
      transactionHash: TX_HASH,
      transactionIndex: 0,
    });

    const installProvider = (
      networkId: number,
      tx: { from: string; to: string },
      logs: ethers.providers.Log[],
    ) => {
      providers.set(networkId, {
        getTransaction: sinon.stub().resolves({
          hash: TX_HASH,
          from: tx.from,
          to: tx.to,
          value: ethers.BigNumber.from(0),
          nonce: 1,
          blockNumber: 12345,
          gasPrice: ethers.BigNumber.from(1),
        }),
        getTransactionReceipt: sinon.stub().resolves({
          status: 1,
          blockNumber: 12345,
          gasUsed: ethers.BigNumber.from(21000),
          logs,
        }),
        getBlock: sinon.stub().resolves({ timestamp: 1600000000 }),
        // No debug_traceTransaction / trace_transaction support.
        send: sinon.stub().rejects(new Error('method not supported')),
      });
    };

    const expectToAddressMismatch = async (promise: Promise<unknown>) => {
      try {
        await promise;
        expect.fail('expected verification to be rejected');
      } catch (error) {
        expect(error).to.be.instanceOf(BlockchainError);
        expect((error as BlockchainError).code).to.equal(
          BlockchainErrorCode.TO_ADDRESS_MISMATCH,
        );
      }
    };

    afterEach(() => {
      sinon.restore();
      providers.delete(100);
      providers.delete(137);
      providers.delete(8453);
    });

    it('ignores a native DonationMade event emitted by a non-handler contract', async () => {
      // A dust donation through the real handler to the attacker's contract,
      // plus a forged event from that contract claiming 1,000 xDAI to a project.
      installProvider(100, { from: ATTACKER, to: ATTACKER_CONTRACT }, [
        donationMadeLog({
          emitter: GNOSIS_HANDLER,
          recipient: ATTACKER_CONTRACT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('0.0001', 18),
          logIndex: 0,
        }),
        donationMadeLog({
          emitter: ATTACKER_CONTRACT,
          recipient: PROJECT_RECIPIENT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('1000', 18),
          logIndex: 1,
        }),
      ]);

      await expectToAddressMismatch(
        evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 100,
          symbol: 'XDAI',
          fromAddress: ATTACKER,
          toAddress: PROJECT_RECIPIENT,
          amount: 1000,
          timestamp: 1600000000,
        }),
      );
    });

    it('ignores an ERC-20 DonationMade event emitted by a non-handler contract', async () => {
      sinon.stub(evmTransactionService, 'getTokenDecimals').resolves(6);
      sinon.stub(evmTransactionService, 'getTokenSymbol').resolves('USDC');
      installProvider(137, { from: ATTACKER, to: ATTACKER_CONTRACT }, [
        donationMadeLog({
          emitter: POLYGON_HANDLER,
          recipient: ATTACKER_CONTRACT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('0.0001', 18),
          logIndex: 0,
        }),
        donationMadeLog({
          emitter: ATTACKER_CONTRACT,
          recipient: PROJECT_RECIPIENT,
          token: USDC_POLYGON,
          amountRaw: ethers.utils.parseUnits('25000', 6),
          logIndex: 1,
        }),
      ]);

      await expectToAddressMismatch(
        evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 137,
          symbol: 'USDC',
          fromAddress: ATTACKER,
          toAddress: PROJECT_RECIPIENT,
          amount: 25000,
          timestamp: 1600000000,
          tokenAddress: USDC_POLYGON,
        }),
      );
    });

    it('reports the handler amount, not a larger forged amount, for the same recipient', async () => {
      installProvider(100, { from: ATTACKER, to: ATTACKER_CONTRACT }, [
        donationMadeLog({
          emitter: ATTACKER_CONTRACT,
          recipient: PROJECT_RECIPIENT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('1000', 18),
          logIndex: 0,
        }),
        donationMadeLog({
          emitter: GNOSIS_HANDLER,
          recipient: PROJECT_RECIPIENT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('1', 18),
          logIndex: 1,
        }),
      ]);

      const result = await evmTransactionService.getTransactionInfo({
        txHash: TX_HASH,
        networkId: 100,
        symbol: 'XDAI',
        fromAddress: ATTACKER,
        toAddress: PROJECT_RECIPIENT,
        amount: 1000,
        timestamp: 1600000000,
      });

      expect(result.amount).to.equal(1);
    });

    it('ignores a forged DonationMade event in an EntryPoint transaction', async () => {
      // No handler involved at all: the attacker's smart account just emits
      // the event during its own UserOperation.
      installProvider(8453, { from: ATTACKER, to: ENTRYPOINT_ADDRESS }, [
        donationMadeLog({
          emitter: SMART_ACCOUNT,
          recipient: PROJECT_RECIPIENT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('500', 18),
          logIndex: 0,
        }),
        userOperationEventLog(SMART_ACCOUNT, 1),
      ]);

      await expectToAddressMismatch(
        evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 8453,
          symbol: 'ETH',
          fromAddress: SMART_ACCOUNT,
          toAddress: PROJECT_RECIPIENT,
          amount: 500,
          timestamp: 1600000000,
        }),
      );
    });

    it('attributes an AA native donation to its UserOperation sender when traces are unavailable', async () => {
      // Two operations in one bundle; the donation belongs to the second one.
      installProvider(8453, { from: ATTACKER, to: ENTRYPOINT_ADDRESS }, [
        userOperationEventLog(OTHER_SMART_ACCOUNT, 0),
        donationMadeLog({
          emitter: BASE_HANDLER,
          recipient: PROJECT_RECIPIENT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('2', 18),
          logIndex: 1,
        }),
        userOperationEventLog(SMART_ACCOUNT, 2),
      ]);

      const result = await evmTransactionService.getTransactionInfo({
        txHash: TX_HASH,
        networkId: 8453,
        symbol: 'ETH',
        // The claimed sender must not be echoed back as the verified sender.
        fromAddress: OTHER_SMART_ACCOUNT,
        toAddress: PROJECT_RECIPIENT,
        amount: 2,
        timestamp: 1600000000,
      });

      expect(result.from.toLowerCase()).to.equal(SMART_ACCOUNT);
      expect(result.amount).to.equal(2);
    });

    it('ignores UserOperationEvent logs not emitted by a known EntryPoint', async () => {
      installProvider(8453, { from: ATTACKER, to: ENTRYPOINT_ADDRESS }, [
        donationMadeLog({
          emitter: BASE_HANDLER,
          recipient: PROJECT_RECIPIENT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('2', 18),
          logIndex: 0,
        }),
        userOperationEventLog(ATTACKER, 1, ATTACKER_CONTRACT),
        userOperationEventLog(SMART_ACCOUNT, 2),
      ]);

      const result = await evmTransactionService.getTransactionInfo({
        txHash: TX_HASH,
        networkId: 8453,
        symbol: 'ETH',
        fromAddress: ATTACKER,
        toAddress: PROJECT_RECIPIENT,
        amount: 2,
        timestamp: 1600000000,
      });

      expect(result.from.toLowerCase()).to.equal(SMART_ACCOUNT);
    });

    it('rejects an AA native donation whose sender cannot be determined', async () => {
      installProvider(8453, { from: ATTACKER, to: ENTRYPOINT_ADDRESS }, [
        donationMadeLog({
          emitter: BASE_HANDLER,
          recipient: PROJECT_RECIPIENT,
          token: NATIVE_40,
          amountRaw: ethers.utils.parseUnits('2', 18),
          logIndex: 0,
        }),
      ]);

      await expectToAddressMismatch(
        evmTransactionService.getTransactionInfo({
          txHash: TX_HASH,
          networkId: 8453,
          symbol: 'ETH',
          fromAddress: ATTACKER,
          toAddress: PROJECT_RECIPIENT,
          amount: 2,
          timestamp: 1600000000,
        }),
      );
    });
  });

  describe('getDonationHandlerLogs (#393 reconciler scan)', () => {
    const DONATION_MADE_SIG = DONATION_MADE_TOPIC;
    const NATIVE_40 = '0'.repeat(40);
    const RECIP = 'a'.repeat(40);
    const ERC20 = 'b'.repeat(40);

    // A 40-hex address encodes into an indexed topic as 24 zero-nibbles + addr.
    const topicOf = (address40: string) => '0x' + '0'.repeat(24) + address40;
    const amountData = (amount: string) =>
      '0x' + BigInt(amount).toString(16).padStart(64, '0');
    const makeLog = (i: {
      recipient40: string;
      token40: string;
      amount: string;
      blockNumber: number;
      logIndex: number;
      transactionHash: string;
    }): ethers.providers.Log =>
      ({
        topics: [DONATION_MADE_SIG, topicOf(i.recipient40), topicOf(i.token40)],
        data: amountData(i.amount),
        blockNumber: i.blockNumber,
        logIndex: i.logIndex,
        transactionHash: i.transactionHash,
      }) as unknown as ethers.providers.Log;

    let provider: {
      getBlockNumber: sinon.SinonStub;
      getLogs: sinon.SinonStub;
      getBlock: sinon.SinonStub;
      getTransactionReceipt: sinon.SinonStub;
      getCode: sinon.SinonStub;
      send: sinon.SinonStub;
    };

    const setProvider = (networkId: number) => {
      provider = {
        getBlockNumber: sinon.stub().resolves(2000),
        getLogs: sinon.stub().resolves([]),
        getBlock: sinon
          .stub()
          .callsFake(async (bn: number) => ({ timestamp: 1_700_000_000 + bn })),
        getTransactionReceipt: sinon.stub().callsFake(async (hash: string) => ({
          from: `0xsender_${hash}`,
          logs: [],
        })),
        getCode: sinon.stub().resolves('0x'),
        send: sinon.stub().rejects(new Error('tracing not supported')),
      };
      providers.set(networkId, provider);
    };

    afterEach(() => {
      providers.delete(NetworkId.MAINNET);
      providers.delete(NetworkId.POLYGON);
      sinon.restore();
    });

    it('decodes native and ERC-20 DonationMade events', async () => {
      setProvider(NetworkId.MAINNET);
      provider.getLogs.resolves([
        makeLog({
          recipient40: RECIP,
          token40: NATIVE_40,
          amount: '1000000000000000000',
          blockNumber: 120,
          logIndex: 0,
          transactionHash: '0xaa',
        }),
        makeLog({
          recipient40: RECIP,
          token40: ERC20,
          amount: '2500000',
          blockNumber: 121,
          logIndex: 1,
          transactionHash: '0xbb',
        }),
      ]);

      const result = await evmTransactionService.getDonationHandlerLogs(
        NetworkId.MAINNET,
        100,
        200,
      );

      expect(result.logs).to.have.length(2);
      const native = result.logs[0];
      expect(native.isNativeToken).to.be.true;
      expect(native.tokenAddress).to.equal('0x' + NATIVE_40);
      expect(native.to).to.equal('0x' + RECIP);
      expect(native.amount).to.equal('1000000000000000000');
      expect(native.from).to.equal('0xsender_0xaa');
      expect(native.blockTimestamp).to.equal(1_700_000_000 + 120);
      const erc20 = result.logs[1];
      expect(erc20.isNativeToken).to.be.false;
      expect(erc20.tokenAddress).to.equal('0x' + ERC20);
      expect(erc20.amount).to.equal('2500000');
    });

    describe('sender attribution for relayed donations', () => {
      const RELAYER = '0x' + 'e'.repeat(40);
      const RELAY_CONTRACT = '0x' + '9'.repeat(40);
      const DONOR = '0x' + 'd'.repeat(40);
      const OTHER_DONOR = '0x' + '7'.repeat(40);
      const ROUTER = '0x' + '8'.repeat(40);
      const OTHER_TOKEN = 'c'.repeat(40);
      const transferLog = (i: {
        token40?: string;
        from: string;
        to: string;
        amount: string;
        logIndex: number;
      }) =>
        ({
          address: '0x' + (i.token40 ?? ERC20),
          topics: [
            TRANSFER_TOPIC,
            topicOf(i.from.slice(2)),
            topicOf(i.to.slice(2)),
          ],
          data: amountData(i.amount),
          logIndex: i.logIndex,
        }) as unknown as ethers.providers.Log;

      const scan = async (params: {
        receiptLogs?: ethers.providers.Log[];
        native?: boolean;
        donationLogIndex?: number;
        txTo?: string;
      }) => {
        setProvider(NetworkId.MAINNET);
        provider.getLogs.resolves([
          makeLog({
            recipient40: RECIP,
            token40: params.native ? NATIVE_40 : ERC20,
            amount: '2500000',
            blockNumber: 120,
            logIndex: params.donationLogIndex ?? 5,
            transactionHash: '0xrelayed',
          }),
        ]);
        provider.getTransactionReceipt.resolves({
          from: RELAYER,
          to: params.txTo ?? RELAY_CONTRACT,
          blockNumber: 120,
          logs: params.receiptLogs ?? [],
        });
        const result = await evmTransactionService.getDonationHandlerLogs(
          NetworkId.MAINNET,
          100,
          200,
        );
        return result.logs[0].from;
      };

      it('uses the donor of a direct donor-to-recipient Transfer', async () => {
        const from = await scan({
          receiptLogs: [
            transferLog({
              from: DONOR,
              to: '0x' + RECIP,
              amount: '2500000',
              logIndex: 4,
            }),
          ],
        });
        expect(from).to.equal(DONOR);
      });

      it('uses the donor that funded the handler for a handler payout', async () => {
        const handler = getDonationHandlerAddresses(NetworkId.MAINNET)[0];
        const from = await scan({
          receiptLogs: [
            transferLog({
              from: DONOR,
              to: handler,
              amount: '3000000',
              logIndex: 1,
            }),
            transferLog({
              from: handler,
              to: '0x' + RECIP,
              amount: '2500000',
              logIndex: 4,
            }),
          ],
        });
        expect(from).to.equal(DONOR);
      });

      it('prefers the preceding funding Transfer over a nearer later one', async () => {
        // A funds a 5-recipient batch at log 0; B funds the handler with the
        // same token right after A's DonationMade (log 11).
        const handler = getDonationHandlerAddresses(NetworkId.MAINNET)[0];
        const from = await scan({
          donationLogIndex: 10,
          receiptLogs: [
            transferLog({
              from: DONOR,
              to: handler,
              amount: '12500000',
              logIndex: 0,
            }),
            transferLog({
              from: handler,
              to: '0x' + RECIP,
              amount: '2500000',
              logIndex: 9,
            }),
            transferLog({
              from: OTHER_DONOR,
              to: handler,
              amount: '2500000',
              logIndex: 11,
            }),
          ],
        });
        expect(from).to.equal(DONOR);
      });

      it('keeps tx.from when no Transfer matches token and amount', async () => {
        const from = await scan({
          receiptLogs: [
            transferLog({
              from: DONOR,
              to: '0x' + RECIP,
              amount: '2499999',
              logIndex: 3,
            }),
            transferLog({
              token40: OTHER_TOKEN,
              from: DONOR,
              to: '0x' + RECIP,
              amount: '2500000',
              logIndex: 4,
            }),
          ],
        });
        expect(from).to.equal(RELAYER);
      });

      it('keeps tx.from when the funder is a contract (router / zap)', async () => {
        setProvider(NetworkId.MAINNET);
        // The router had code at the donation's block (120) but has since
        // self-destructed, so it reads as '0x' at the head.
        provider.getCode.withArgs(ROUTER, 120).resolves('0x6080604052');
        provider.getLogs.resolves([
          makeLog({
            recipient40: RECIP,
            token40: ERC20,
            amount: '2500000',
            blockNumber: 120,
            logIndex: 5,
            transactionHash: '0xrouted',
          }),
        ]);
        provider.getTransactionReceipt.resolves({
          from: RELAYER,
          to: ROUTER,
          blockNumber: 120,
          logs: [
            transferLog({
              from: ROUTER,
              to: '0x' + RECIP,
              amount: '2500000',
              logIndex: 4,
            }),
          ],
        });
        const result = await evmTransactionService.getDonationHandlerLogs(
          NetworkId.MAINNET,
          100,
          200,
        );
        expect(provider.getCode.calledWith(ROUTER, 120)).to.equal(true);
        expect(result.logs[0].from).to.equal(RELAYER);
      });

      it('credits an EIP-7702-delegated donor', async () => {
        setProvider(NetworkId.MAINNET);
        provider.getCode
          .withArgs(DONOR)
          .resolves('0xef0100' + '63c0c19a282a1b52b07dd5a65b58948a07dae32b');
        provider.getLogs.resolves([
          makeLog({
            recipient40: RECIP,
            token40: ERC20,
            amount: '2500000',
            blockNumber: 120,
            logIndex: 5,
            transactionHash: '0xrelayed',
          }),
        ]);
        provider.getTransactionReceipt.resolves({
          from: RELAYER,
          to: RELAY_CONTRACT,
          blockNumber: 120,
          logs: [
            transferLog({
              from: DONOR,
              to: '0x' + RECIP,
              amount: '2500000',
              logIndex: 4,
            }),
          ],
        });
        const result = await evmTransactionService.getDonationHandlerLogs(
          NetworkId.MAINNET,
          100,
          200,
        );
        expect(result.logs[0].from).to.equal(DONOR);
        expect(provider.getCode.calledWith(DONOR, 120)).to.equal(true);
      });

      it('credits the traced funder of a relayed native donation', async () => {
        const handler = getDonationHandlerAddresses(
          NetworkId.MAINNET,
        )[0].toLowerCase();
        setProvider(NetworkId.MAINNET);
        provider.send.withArgs('debug_traceTransaction').resolves({
          type: 'CALL',
          from: RELAYER,
          to: RELAY_CONTRACT,
          value: '0x0',
          calls: [
            {
              type: 'CALL',
              from: DONOR,
              to: handler,
              value: '0x2625a0',
              calls: [
                {
                  type: 'CALL',
                  from: handler,
                  to: '0x' + RECIP,
                  value: '0x2625a0',
                },
              ],
            },
          ],
        });
        provider.getLogs.resolves([
          makeLog({
            recipient40: RECIP,
            token40: NATIVE_40,
            amount: '2500000',
            blockNumber: 120,
            logIndex: 5,
            transactionHash: '0xrelayed',
          }),
        ]);
        provider.getTransactionReceipt.resolves({
          from: RELAYER,
          to: RELAY_CONTRACT,
          logs: [],
        });
        const result = await evmTransactionService.getDonationHandlerLogs(
          NetworkId.MAINNET,
          100,
          200,
        );
        expect(result.logs[0].from).to.equal(DONOR);
      });

      it('ignores reverted trace_transaction entries and their subtree', async () => {
        const handler = getDonationHandlerAddresses(
          NetworkId.MAINNET,
        )[0].toLowerCase();
        setProvider(NetworkId.MAINNET);
        const entry = (
          traceAddress: number[],
          action: { from: string; to: string; value: string },
          error?: string,
        ) => ({
          action: { callType: 'call', ...action },
          traceAddress,
          ...(error ? { error } : {}),
        });
        // OTHER_DONOR's call paying RECIP reverted; DONOR's call paying a
        // different recipient landed. Neither may be credited for RECIP.
        provider.send.withArgs('trace_transaction').resolves([
          entry([], { from: RELAYER, to: RELAY_CONTRACT, value: '0x0' }),
          entry(
            [0],
            { from: OTHER_DONOR, to: handler, value: '0x2625a0' },
            'Reverted',
          ),
          entry([0, 0], {
            from: handler,
            to: '0x' + RECIP,
            value: '0x2625a0',
          }),
          entry([1], { from: DONOR, to: handler, value: '0x2625a0' }),
          entry([1, 0], {
            from: handler,
            to: '0x' + 'f'.repeat(40),
            value: '0x2625a0',
          }),
        ]);
        provider.getLogs.resolves([
          makeLog({
            recipient40: RECIP,
            token40: NATIVE_40,
            amount: '2500000',
            blockNumber: 120,
            logIndex: 5,
            transactionHash: '0xreverted',
          }),
        ]);
        provider.getTransactionReceipt.resolves({
          from: RELAYER,
          to: RELAY_CONTRACT,
          blockNumber: 120,
          logs: [],
        });
        const result = await evmTransactionService.getDonationHandlerLogs(
          NetworkId.MAINNET,
          100,
          200,
        );
        expect(provider.send.calledWith('trace_transaction')).to.equal(true);
        expect(result.logs[0].from).to.equal(RELAYER);
      });

      it('keeps tx.from and still returns when the historical code lookup fails', async () => {
        setProvider(NetworkId.MAINNET);
        provider.getCode.rejects(new Error('missing trie node abc123'));
        provider.getLogs.resolves([
          makeLog({
            recipient40: RECIP,
            token40: ERC20,
            amount: '2500000',
            blockNumber: 120,
            logIndex: 5,
            transactionHash: '0xpruned',
          }),
        ]);
        provider.getTransactionReceipt.resolves({
          from: RELAYER,
          to: RELAY_CONTRACT,
          blockNumber: 120,
          logs: [
            transferLog({
              from: DONOR,
              to: '0x' + RECIP,
              amount: '2500000',
              logIndex: 4,
            }),
          ],
        });
        const result = await evmTransactionService.getDonationHandlerLogs(
          NetworkId.MAINNET,
          100,
          200,
        );
        expect(result.logs).to.have.length(1);
        expect(result.logs[0].from).to.equal(RELAYER);
      });

      it('keeps tx.from and still returns when tracing fails, even transiently', async () => {
        setProvider(NetworkId.MAINNET);
        provider.send.rejects(
          Object.assign(new Error('bad response'), {
            code: 'SERVER_ERROR',
            status: 503,
          }),
        );
        const from = await scan({ native: true });
        expect(provider.send.called).to.equal(true);
        expect(from).to.equal(RELAYER);
      });

      it('keeps tx.from when the RPC does not support tracing', async () => {
        setProvider(NetworkId.MAINNET);
        provider.send.rejects(
          Object.assign(new Error('method not found'), { code: -32601 }),
        );
        const from = await scan({ native: true });
        expect(provider.send.called).to.equal(true);
        expect(from).to.equal(RELAYER);
      });

      it('does not trace a native donation sent straight to the handler', async () => {
        const from = await scan({
          native: true,
          txTo: getDonationHandlerAddresses(NetworkId.MAINNET)[0],
        });
        expect(provider.send.called).to.equal(false);
        expect(from).to.equal(RELAYER);
      });
    });

    it('clamps toBlock to the current head and reports it as latestBlock', async () => {
      setProvider(NetworkId.MAINNET);
      provider.getBlockNumber.resolves(150);

      const result = await evmTransactionService.getDonationHandlerLogs(
        NetworkId.MAINNET,
        100,
        99_999,
      );

      expect(result.latestBlock).to.equal(150);
      expect(result.toBlock).to.equal(150);
      expect(provider.getLogs.firstCall.args[0].toBlock).to.equal(150);
    });

    it('returns nothing (no getLogs) when fromBlock is beyond the head', async () => {
      setProvider(NetworkId.MAINNET);
      provider.getBlockNumber.resolves(150);

      const result = await evmTransactionService.getDonationHandlerLogs(
        NetworkId.MAINNET,
        200,
        300,
      );

      expect(result.logs).to.deep.equal([]);
      expect(provider.getLogs.called).to.be.false;
    });

    it('sorts results by block number then log index', async () => {
      setProvider(NetworkId.MAINNET);
      provider.getLogs.resolves([
        makeLog({
          recipient40: RECIP,
          token40: NATIVE_40,
          amount: '1',
          blockNumber: 130,
          logIndex: 5,
          transactionHash: '0xc1',
        }),
        makeLog({
          recipient40: RECIP,
          token40: NATIVE_40,
          amount: '1',
          blockNumber: 120,
          logIndex: 9,
          transactionHash: '0xc2',
        }),
        makeLog({
          recipient40: RECIP,
          token40: NATIVE_40,
          amount: '1',
          blockNumber: 120,
          logIndex: 2,
          transactionHash: '0xc3',
        }),
      ]);

      const result = await evmTransactionService.getDonationHandlerLogs(
        NetworkId.MAINNET,
        100,
        200,
      );

      expect(result.logs.map((l) => [l.blockNumber, l.logIndex])).to.deep.equal(
        [
          [120, 2],
          [120, 9],
          [130, 5],
        ],
      );
    });

    it('de-duplicates block and transaction lookups', async () => {
      setProvider(NetworkId.MAINNET);
      // Two events sharing a block and a transaction.
      provider.getLogs.resolves([
        makeLog({
          recipient40: RECIP,
          token40: NATIVE_40,
          amount: '1',
          blockNumber: 120,
          logIndex: 0,
          transactionHash: '0xsame',
        }),
        makeLog({
          recipient40: RECIP,
          token40: ERC20,
          amount: '2',
          blockNumber: 120,
          logIndex: 1,
          transactionHash: '0xsame',
        }),
      ]);

      await evmTransactionService.getDonationHandlerLogs(
        NetworkId.MAINNET,
        100,
        200,
      );

      expect(provider.getBlock.callCount).to.equal(1);
      expect(provider.getTransactionReceipt.callCount).to.equal(1);
    });

    it('scans every handler address of a multi-handler network and merges', async () => {
      setProvider(NetworkId.POLYGON);
      const handlers = getDonationHandlerAddresses(NetworkId.POLYGON);
      expect(handlers.length).to.be.greaterThan(1);
      provider.getLogs
        .onCall(0)
        .resolves([
          makeLog({
            recipient40: RECIP,
            token40: NATIVE_40,
            amount: '1',
            blockNumber: 120,
            logIndex: 0,
            transactionHash: '0xh1',
          }),
        ])
        .onCall(1)
        .resolves([
          makeLog({
            recipient40: RECIP,
            token40: ERC20,
            amount: '2',
            blockNumber: 121,
            logIndex: 0,
            transactionHash: '0xh2',
          }),
        ]);

      const result = await evmTransactionService.getDonationHandlerLogs(
        NetworkId.POLYGON,
        100,
        200,
      );

      expect(provider.getLogs.callCount).to.equal(handlers.length);
      expect(result.logs.map((l) => l.transactionHash)).to.deep.equal([
        '0xh1',
        '0xh2',
      ]);
    });

    it('throws NETWORK_ERROR when a block is unavailable during enrichment', async () => {
      setProvider(NetworkId.MAINNET);
      provider.getLogs.resolves([
        makeLog({
          recipient40: RECIP,
          token40: NATIVE_40,
          amount: '1',
          blockNumber: 120,
          logIndex: 0,
          transactionHash: '0xaa',
        }),
      ]);
      provider.getBlock.resolves(null);

      let error: unknown;
      try {
        await evmTransactionService.getDonationHandlerLogs(
          NetworkId.MAINNET,
          100,
          200,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(BlockchainError);
      expect((error as BlockchainError).code).to.equal(
        BlockchainErrorCode.NETWORK_ERROR,
      );
    });

    it('throws NETWORK_ERROR when a transaction is unavailable during enrichment', async () => {
      setProvider(NetworkId.MAINNET);
      provider.getLogs.resolves([
        makeLog({
          recipient40: RECIP,
          token40: NATIVE_40,
          amount: '1',
          blockNumber: 120,
          logIndex: 0,
          transactionHash: '0xaa',
        }),
      ]);
      provider.getTransactionReceipt.resolves(null);

      let error: unknown;
      try {
        await evmTransactionService.getDonationHandlerLogs(
          NetworkId.MAINNET,
          100,
          200,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(BlockchainError);
      expect((error as BlockchainError).code).to.equal(
        BlockchainErrorCode.NETWORK_ERROR,
      );
    });

    it('rejects a non-EVM network with UNSUPPORTED_CHAIN', async () => {
      let error: unknown;
      try {
        await evmTransactionService.getDonationHandlerLogs(
          NetworkId.SOLANA_MAINNET,
          1,
          2,
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(BlockchainError);
      expect((error as BlockchainError).code).to.equal(
        BlockchainErrorCode.UNSUPPORTED_CHAIN,
      );
    });

    it('returns the head with no logs in latest-only mode (no range)', async () => {
      setProvider(NetworkId.MAINNET);
      provider.getBlockNumber.resolves(1234);

      const result = await evmTransactionService.getDonationHandlerLogs(
        NetworkId.MAINNET,
      );

      expect(result.latestBlock).to.equal(1234);
      expect(result.logs).to.deep.equal([]);
      expect(provider.getLogs.called).to.be.false;
    });
  });

  describe('checkErc721Ownership (optional historical block)', () => {
    // Lowercase on purpose: ethers rejects a mixed-case address whose checksum
    // is wrong, and callers send lowercased addresses.
    const WALLET = '0x742d35cc6634c0532925a3b844bc9e7595f0beb0';
    const CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const encodeBalance = (n: number) =>
      ethers.utils.defaultAbiCoder.encode(['uint256'], [n]);

    let call: sinon.SinonStub;
    let getCode: sinon.SinonStub;

    beforeEach(() => {
      // A real provider object (ethers.Contract insists on one) whose only
      // network-touching methods, `call` and `getCode`, are stubbed.
      const provider = new ethers.providers.JsonRpcProvider(
        'http://127.0.0.1:1',
        1,
      );
      call = sinon.stub(provider, 'call').resolves(encodeBalance(1));
      getCode = sinon.stub(provider, 'getCode').resolves('0x6080604052');
      providers.set(NetworkId.MAINNET, provider);
    });

    afterEach(() => {
      providers.delete(NetworkId.MAINNET);
      sinon.restore();
    });

    it('reads at the latest block when no block is given', async () => {
      const owns = await evmTransactionService.checkErc721Ownership(
        NetworkId.MAINNET,
        WALLET,
        CONTRACT,
      );

      expect(owns).to.be.true;
      expect(call.calledOnce).to.be.true;
      expect(call.firstCall.args[1]).to.equal(undefined);
    });

    it('pins the read to the requested block', async () => {
      call.resolves(encodeBalance(0));

      const owns = await evmTransactionService.checkErc721Ownership(
        NetworkId.MAINNET,
        WALLET,
        CONTRACT,
        19_000_000,
      );

      expect(owns).to.be.false;
      expect(call.firstCall.args[1]).to.equal(19_000_000);
    });

    describe('the four historical outcomes', () => {
      it('contract exists and the wallet owns a token -> true', async () => {
        call.resolves(encodeBalance(2));

        const owns = await evmTransactionService.checkErc721Ownership(
          NetworkId.MAINNET,
          WALLET,
          CONTRACT,
          20_000_001,
        );

        expect(owns).to.be.true;
        // The happy path costs one RPC call; contract existence is only
        // checked when the read fails.
        expect(getCode.called).to.be.false;
      });

      it('contract exists and the wallet owns nothing -> false', async () => {
        call.resolves(encodeBalance(0));

        const owns = await evmTransactionService.checkErc721Ownership(
          NetworkId.MAINNET,
          WALLET,
          CONTRACT,
          20_000_002,
        );

        expect(owns).to.be.false;
        expect(getCode.called).to.be.false;
      });

      it('contract did not exist at that block -> false, not an error', async () => {
        // eth_call against an address with no code returns empty data, which
        // ethers turns into a CALL_EXCEPTION.
        call.resolves('0x');
        getCode.resolves('0x');

        const owns = await evmTransactionService.checkErc721Ownership(
          NetworkId.MAINNET,
          WALLET,
          CONTRACT,
          20_000_003,
        );

        expect(owns).to.be.false;
        expect(getCode.calledOnceWithExactly(CONTRACT, 20_000_003)).to.be.true;
      });

      it('RPC failure with the contract deployed -> raises (unknown)', async () => {
        call.rejects(new Error('missing trie node'));
        getCode.resolves('0x6080604052');

        try {
          await evmTransactionService.checkErc721Ownership(
            NetworkId.MAINNET,
            WALLET,
            CONTRACT,
            20_000_004,
          );
          expect.fail('expected the ownership check to throw');
        } catch (error) {
          expect(error).to.be.instanceOf(BlockchainError);
          expect((error as BlockchainError).code).to.equal(
            BlockchainErrorCode.NETWORK_ERROR,
          );
        }
      });

      it('RPC failure on the existence check too -> raises (unknown), never false', async () => {
        call.rejects(new Error('timeout'));
        getCode.rejects(new Error('timeout'));

        try {
          await evmTransactionService.checkErc721Ownership(
            NetworkId.MAINNET,
            WALLET,
            CONTRACT,
            20_000_005,
          );
          expect.fail('expected the ownership check to throw');
        } catch (error) {
          expect(error).to.be.instanceOf(BlockchainError);
        }
      });

      it('remembers a contract with no code at a block and stops calling the RPC', async () => {
        call.resolves('0x');
        getCode.resolves('0x');
        const OTHER_WALLET = '0x00000000000000000000000000000000000000aa';

        await evmTransactionService.checkErc721Ownership(
          NetworkId.MAINNET,
          WALLET,
          CONTRACT,
          20_000_006,
        );
        call.resetHistory();
        getCode.resetHistory();

        const owns = await evmTransactionService.checkErc721Ownership(
          NetworkId.MAINNET,
          OTHER_WALLET,
          CONTRACT,
          20_000_006,
        );

        expect(owns).to.be.false;
        expect(call.called).to.be.false;
        expect(getCode.called).to.be.false;

        // A different block is a different question.
        call.resolves(encodeBalance(1));
        expect(
          await evmTransactionService.checkErc721Ownership(
            NetworkId.MAINNET,
            OTHER_WALLET,
            CONTRACT,
            20_000_007,
          ),
        ).to.be.true;
      });

      it('a latest-block read keeps its old behaviour: a failed call raises', async () => {
        call.resolves('0x');
        getCode.resolves('0x');

        try {
          await evmTransactionService.checkErc721Ownership(
            NetworkId.MAINNET,
            WALLET,
            CONTRACT,
          );
          expect.fail('expected the ownership check to throw');
        } catch (error) {
          expect(error).to.be.instanceOf(BlockchainError);
        }
        expect(getCode.called).to.be.false;
      });
    });

    it('raises instead of answering when the historical read fails', async () => {
      call.rejects(new Error('missing trie node'));

      try {
        await evmTransactionService.checkErc721Ownership(
          NetworkId.MAINNET,
          WALLET,
          CONTRACT,
          19_000_000,
        );
        expect.fail('expected the ownership check to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(BlockchainError);
        expect((error as BlockchainError).code).to.equal(
          BlockchainErrorCode.NETWORK_ERROR,
        );
      }
    });
  });

  describe('getBlockNumberAtTimestamp', () => {
    // Block n is mined at 1000 + 12n, so timestamps map back unambiguously.
    const timestampOf = (n: number) => 1000 + 12 * n;
    let getBlock: sinon.SinonStub;

    const setChain = (height: number) => {
      getBlock = sinon.stub().callsFake(async (tag: number | string) => {
        const number = tag === 'latest' ? height : (tag as number);
        return { number, timestamp: timestampOf(number) };
      });
      providers.set(NetworkId.MAINNET, { getBlock });
    };

    afterEach(() => {
      providers.delete(NetworkId.MAINNET);
      sinon.restore();
    });

    it('returns the block mined exactly at the timestamp', async () => {
      setChain(1000);

      const result = await evmTransactionService.getBlockNumberAtTimestamp(
        NetworkId.MAINNET,
        timestampOf(337),
      );

      expect(result).to.deep.equal({
        blockNumber: 337,
        blockTimestamp: timestampOf(337),
      });
    });

    it('returns the last block before a timestamp that falls between blocks', async () => {
      setChain(1000);

      const result = await evmTransactionService.getBlockNumberAtTimestamp(
        NetworkId.MAINNET,
        timestampOf(338) - 1,
      );

      expect(result.blockNumber).to.equal(337);
      // Binary search, not a scan.
      expect(getBlock.callCount).to.be.lessThan(20);
    });

    it('returns the head when the timestamp equals the latest block', async () => {
      setChain(1000);

      const result = await evmTransactionService.getBlockNumberAtTimestamp(
        NetworkId.MAINNET,
        timestampOf(1000),
      );

      expect(result.blockNumber).to.equal(1000);
    });

    it('refuses a timestamp ahead of the chain head', async () => {
      setChain(1000);

      try {
        await evmTransactionService.getBlockNumberAtTimestamp(
          NetworkId.MAINNET,
          timestampOf(1000) + 1,
        );
        expect.fail('expected the lookup to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(BlockchainError);
      }
    });

    it('refuses a timestamp before the first block', async () => {
      setChain(1000);

      try {
        await evmTransactionService.getBlockNumberAtTimestamp(
          NetworkId.MAINNET,
          timestampOf(0) - 1,
        );
        expect.fail('expected the lookup to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(BlockchainError);
      }
    });
  });
});
