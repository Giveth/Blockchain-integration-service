import { expect } from 'chai';
import sinon from 'sinon';
import axios from 'axios';
import {
  FINN_ADDRESS_MAINNET,
  PriceService,
  TIK_ADDRESS_MAINNET,
} from './priceService';

describe('PriceService - fixed-price overrides', () => {
  let axiosGetStub: sinon.SinonStub;
  let priceService: PriceService;

  const ETH_COINGECKO_URL =
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

  beforeEach(() => {
    axiosGetStub = sinon.stub(axios, 'get');
    // Fresh instance per test to avoid cross-test cache pollution.
    priceService = new PriceService();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getTokenPrice', () => {
    it('uses the GIV symbol mapping for direct price lookup', async () => {
      axiosGetStub.resolves({
        data: {
          giveth: {
            usd: 0.055,
          },
        },
      });

      const result = await priceService.getTokenPrice({
        networkId: 1,
        symbol: 'GIV',
      });

      expect(result).to.equal(0.055);
      sinon.assert.calledOnceWithExactly(
        axiosGetStub,
        'https://api.coingecko.com/api/v3/simple/price?ids=giveth&vs_currencies=usd',
        { timeout: 10000 },
      );
    });

    it('uses contract address lookup when tokenAddress is provided', async () => {
      const tokenAddress = '0x1234567890abcdef1234567890abcdef12345678';
      axiosGetStub.resolves({
        data: {
          [tokenAddress.toLowerCase()]: {
            usd: 1.23,
          },
        },
      });

      const result = await priceService.getTokenPrice({
        networkId: 1,
        symbol: 'TEST',
        tokenAddress,
      });

      expect(result).to.equal(1.23);
      sinon.assert.calledOnceWithExactly(
        axiosGetStub,
        `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress.toLowerCase()}&vs_currencies=usd`,
        { timeout: 10000 },
      );
    });
  });

  it('returns 0.001 * ETH USD price for FINN at the mock mainnet address', async () => {
    axiosGetStub.withArgs(ETH_COINGECKO_URL, sinon.match.any).resolves({
      data: { ethereum: { usd: 2500 } },
    });

    const price = await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'FINN',
      tokenAddress: FINN_ADDRESS_MAINNET,
    });

    expect(price).to.equal(2.5);
    expect(axiosGetStub.calledOnce).to.be.true;
    expect(axiosGetStub.firstCall.args[0]).to.equal(ETH_COINGECKO_URL);
  });

  it('matches the FINN override case-insensitively on the address', async () => {
    axiosGetStub.withArgs(ETH_COINGECKO_URL, sinon.match.any).resolves({
      data: { ethereum: { usd: 3000 } },
    });

    const price = await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'FINN',
      tokenAddress: FINN_ADDRESS_MAINNET.toUpperCase(),
    });

    expect(price).to.equal(3);
    expect(axiosGetStub.calledOnce).to.be.true;
    expect(axiosGetStub.firstCall.args[0]).to.equal(ETH_COINGECKO_URL);
  });

  it('does not hit the CoinGecko token_price endpoint for FINN', async () => {
    axiosGetStub.withArgs(ETH_COINGECKO_URL, sinon.match.any).resolves({
      data: { ethereum: { usd: 2000 } },
    });

    await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'FINN',
      tokenAddress: FINN_ADDRESS_MAINNET,
    });

    const calledUrls = axiosGetStub.getCalls().map((c) => c.args[0]);
    expect(calledUrls).to.have.lengthOf(1);
    expect(calledUrls[0]).to.not.include('/simple/token_price/');
  });

  it('caches the derived FINN price within the TTL', async () => {
    axiosGetStub.withArgs(ETH_COINGECKO_URL, sinon.match.any).resolves({
      data: { ethereum: { usd: 2500 } },
    });

    const first = await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'FINN',
      tokenAddress: FINN_ADDRESS_MAINNET,
    });
    const second = await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'FINN',
      tokenAddress: FINN_ADDRESS_MAINNET,
    });

    expect(first).to.equal(2.5);
    expect(second).to.equal(2.5);
    expect(axiosGetStub.calledOnce).to.be.true;
  });

  it('shares native symbol prices across networks to avoid duplicate CoinGecko calls', async () => {
    axiosGetStub.resolves({
      data: { ethereum: { usd: 2500 } },
    });

    const mainnetPrice = await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'ETH',
    });
    const optimismPrice = await priceService.getTokenPrice({
      networkId: 10,
      symbol: 'ETH',
    });

    expect(mainnetPrice).to.equal(2500);
    expect(optimismPrice).to.equal(2500);
    expect(axiosGetStub.calledOnce).to.be.true;
  });

  it('uses stale cached native prices when CoinGecko is temporarily unavailable', async () => {
    const cache = (
      priceService as unknown as {
        priceCache: Map<string, { price: number; timestamp: number }>;
      }
    ).priceCache;
    cache.set('symbol:ETH', {
      price: 2500,
      timestamp: Date.now() - 120_000,
    });
    axiosGetStub.rejects(new Error('Request failed with status code 429'));

    const price = await priceService.getTokenPrice({
      networkId: 10,
      symbol: 'ETH',
    });

    expect(price).to.equal(2500);
  });

  it('returns a hardcoded $1 USD price for TIK on mainnet', async () => {
    const price = await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'TIK',
      tokenAddress: TIK_ADDRESS_MAINNET,
    });

    expect(price).to.equal(1);
    expect(axiosGetStub.notCalled).to.be.true;
  });

  it('matches the TIK override case-insensitively on the address', async () => {
    const price = await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'TIK',
      tokenAddress: TIK_ADDRESS_MAINNET.toUpperCase(),
    });

    expect(price).to.equal(1);
    expect(axiosGetStub.notCalled).to.be.true;
  });

  it('still routes TIK through CoinGecko outside Ethereum mainnet', async () => {
    axiosGetStub.resolves({
      data: { [TIK_ADDRESS_MAINNET]: { usd: 0.5 } },
    });

    const price = await priceService.getTokenPrice({
      networkId: 137,
      symbol: 'TIK',
      tokenAddress: TIK_ADDRESS_MAINNET,
    });

    expect(price).to.equal(0.5);
    sinon.assert.calledOnceWithExactly(
      axiosGetStub,
      `https://api.coingecko.com/api/v3/simple/token_price/polygon-pos?contract_addresses=${TIK_ADDRESS_MAINNET}&vs_currencies=usd`,
      { timeout: 10000 },
    );
  });

  it('still routes non-FINN ERC-20 tokens through the CoinGecko token_price endpoint', async () => {
    const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    axiosGetStub.resolves({
      data: { [usdcAddress.toLowerCase()]: { usd: 1 } },
    });

    const price = await priceService.getTokenPrice({
      networkId: 1,
      symbol: 'USDC',
      tokenAddress: usdcAddress,
    });

    expect(price).to.equal(1);
    expect(axiosGetStub.calledOnce).to.be.true;
    expect(axiosGetStub.firstCall.args[0]).to.include(
      '/simple/token_price/ethereum',
    );
    expect(axiosGetStub.firstCall.args[0]).to.include(
      usdcAddress.toLowerCase(),
    );
  });
});
