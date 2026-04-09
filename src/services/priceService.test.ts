import { expect } from 'chai';
import sinon from 'sinon';
import axios from 'axios';
import { priceService } from './priceService';

describe('PriceService', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('getTokenPrice', () => {
    it('uses the GIV symbol mapping for direct price lookup', async () => {
      const axiosGetStub = sinon.stub(axios, 'get').resolves({
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
      const axiosGetStub = sinon.stub(axios, 'get').resolves({
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
});
