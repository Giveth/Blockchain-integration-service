import { expect } from 'chai';
import request from 'supertest';
import { createApp } from '../app';

describe('Chains Routes', () => {
  const app = createApp();

  describe('GET /api/chains', () => {
    it('should return all supported chains', async () => {
      const response = await request(app).get('/api/chains').expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('chains');
      expect(response.body.data.chains).to.be.an('array');
      expect(response.body.data.chains.length).to.be.greaterThan(0);
    });

    it('should return chains with required properties', async () => {
      const response = await request(app).get('/api/chains').expect(200);

      const chain = response.body.data.chains[0];
      expect(chain).to.have.property('id');
      expect(chain).to.have.property('name');
      expect(chain).to.have.property('nativeCurrency');
      expect(chain).to.have.property('blockExplorerUrl');
      expect(chain).to.have.property('isActive');

      // Check nativeCurrency structure
      expect(chain.nativeCurrency).to.have.property('name');
      expect(chain.nativeCurrency).to.have.property('symbol');
      expect(chain.nativeCurrency).to.have.property('decimals');
    });

    it('should include common networks', async () => {
      const response = await request(app).get('/api/chains').expect(200);

      const chainIds = response.body.data.chains.map(
        (c: { id: number }) => c.id,
      );

      // Check for Ethereum mainnet
      expect(chainIds).to.include(1);
      // Check for Polygon
      expect(chainIds).to.include(137);
    });
  });

  describe('GET /api/chains/:networkId', () => {
    it('should return a specific chain', async () => {
      const response = await request(app).get('/api/chains/1').expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('id', 1);
      expect(response.body.data).to.have.property('name');
      expect(response.body.data.name.toLowerCase()).to.include('ethereum');
    });

    it('should return 404 for unknown chain', async () => {
      const response = await request(app).get('/api/chains/999999').expect(404);

      expect(response.body.success).to.be.false;
      expect(response.body.code).to.equal('CHAIN_NOT_FOUND');
    });

    it('should return 400 for invalid networkId', async () => {
      const response = await request(app)
        .get('/api/chains/invalid')
        .expect(400);

      expect(response.body.success).to.be.false;
    });
  });

  describe('GET /api/chains/:networkId/transaction-url/:txHash', () => {
    const validTxHash =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    it('should return transaction URL for Ethereum mainnet', async () => {
      const response = await request(app)
        .get(`/api/chains/1/transaction-url/${validTxHash}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('url');
      expect(response.body.data.url).to.include('etherscan.io');
      expect(response.body.data.url).to.include(validTxHash);
    });

    it('should return transaction URL for Polygon', async () => {
      const response = await request(app)
        .get(`/api/chains/137/transaction-url/${validTxHash}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data.url).to.include('polygonscan');
      expect(response.body.data.url).to.include('/tx/');
    });

    it('should return 404 for unknown chain', async () => {
      const response = await request(app)
        .get(`/api/chains/999999/transaction-url/${validTxHash}`)
        .expect(404);

      expect(response.body.success).to.be.false;
    });

    it('should return 400 for invalid networkId', async () => {
      const response = await request(app)
        .get(`/api/chains/invalid/transaction-url/${validTxHash}`)
        .expect(400);

      expect(response.body.success).to.be.false;
    });
  });
});
