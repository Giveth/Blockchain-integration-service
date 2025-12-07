import { expect } from 'chai';
import request from 'supertest';
import { createApp } from '../app';
import { TransactionStatus } from '../../types';

describe('Transaction Routes', () => {
  const app = createApp();

  describe('POST /api/verify', () => {
    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/verify')
        .send({})
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error).to.equal('Validation failed');
      expect(response.body.details).to.be.an('array');
    });

    it('should return 400 for invalid networkId type', async () => {
      const response = await request(app)
        .post('/api/verify')
        .send({
          txHash: '0x123',
          networkId: 'invalid',
          symbol: 'ETH',
          fromAddress: '0x123',
          toAddress: '0x456',
          amount: 1,
          timestamp: Date.now(),
        })
        .expect(400);

      expect(response.body.success).to.be.false;
    });

    it('should accept valid transaction verification request', async () => {
      const response = await request(app)
        .post('/api/verify')
        .send({
          txHash:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          networkId: 1,
          symbol: 'ETH',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.5,
          timestamp: Math.floor(Date.now() / 1000),
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;
      expect(response.body.data).to.have.property('status');
      expect(Object.values(TransactionStatus)).to.include(
        response.body.data.status,
      );
    });

    it('should handle optional fields', async () => {
      const response = await request(app)
        .post('/api/verify')
        .send({
          txHash:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          networkId: 1,
          symbol: 'ETH',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.5,
          timestamp: Math.floor(Date.now() / 1000),
          isSwap: true,
          nonce: 42,
        })
        .expect(200);

      expect(response.body.success).to.be.true;
    });
  });

  describe('POST /api/verify-batch', () => {
    it('should return 400 for empty transactions array', async () => {
      const response = await request(app)
        .post('/api/verify-batch')
        .send({ transactions: [] })
        .expect(400);

      expect(response.body.success).to.be.false;
    });

    it('should return 400 for more than 100 transactions', async () => {
      const transactions = Array(101).fill({
        txHash:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        networkId: 1,
        symbol: 'ETH',
        fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        amount: 1.0,
        timestamp: Math.floor(Date.now() / 1000),
      });

      const response = await request(app)
        .post('/api/verify-batch')
        .send({ transactions })
        .expect(400);

      expect(response.body.success).to.be.false;
    });

    it('should process valid batch request', async () => {
      const transactions = [
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

      const response = await request(app)
        .post('/api/verify-batch')
        .send({ transactions })
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data.total).to.equal(2);
      expect(response.body.data.results).to.have.lengthOf(2);
      // Check that results have status field
      response.body.data.results.forEach((result: { status: string }) => {
        expect(result).to.have.property('status');
      });
    });
  });

  describe('POST /api/timestamp', () => {
    it('should return 400 for missing txHash', async () => {
      const response = await request(app)
        .post('/api/timestamp')
        .send({ networkId: 1 })
        .expect(400);

      expect(response.body.success).to.be.false;
    });

    it('should return 400 for missing networkId', async () => {
      const response = await request(app)
        .post('/api/timestamp')
        .send({
          txHash:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        })
        .expect(400);

      expect(response.body.success).to.be.false;
    });

    it('should accept valid timestamp request', async () => {
      const response = await request(app).post('/api/timestamp').send({
        txHash:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        networkId: 1,
      });

      expect(response.body).to.have.property('success');
    });
  });

  describe('POST /api/price', () => {
    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/price')
        .send({})
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error).to.equal('Validation failed');
    });

    it('should return 400 for missing symbol', async () => {
      const response = await request(app)
        .post('/api/price')
        .send({ networkId: 1 })
        .expect(400);

      expect(response.body.success).to.be.false;
    });

    it('should accept valid price request for native token', async () => {
      const response = await request(app)
        .post('/api/price')
        .send({
          networkId: 1,
          symbol: 'ETH',
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('priceUsd');
      expect(response.body.data.symbol).to.equal('ETH');
      expect(response.body.data.networkId).to.equal(1);
    });

    it('should accept valid price request with token address', async () => {
      const response = await request(app)
        .post('/api/price')
        .send({
          networkId: 1,
          symbol: 'USDC',
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('priceUsd');
    });

    it('should accept null tokenAddress', async () => {
      const response = await request(app)
        .post('/api/price')
        .send({
          networkId: 1,
          symbol: 'ETH',
          tokenAddress: null,
        })
        .expect(200);

      expect(response.body.success).to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/verify')
        .set('Content-Type', 'application/json')
        .send('invalid json{');

      expect(response.status).to.be.oneOf([400, 500]);
      expect(response.body).to.exist;
    });

    it('should return 404 for unknown endpoint', async () => {
      const response = await request(app)
        .post('/api/unknown-endpoint')
        .send({})
        .expect(404);

      expect(response.body.success).to.be.false;
      expect(response.body.error).to.equal('Endpoint not found');
    });
  });

  describe('CORS and Headers', () => {
    it('should include CORS headers', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers['access-control-allow-origin']).to.exist;
    });

    it('should accept JSON content type', async () => {
      const response = await request(app)
        .post('/api/verify')
        .set('Content-Type', 'application/json')
        .send({
          txHash:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          networkId: 1,
          symbol: 'ETH',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.0,
          timestamp: Math.floor(Date.now() / 1000),
        });

      expect(response.headers['content-type']).to.match(/json/);
    });
  });
});
