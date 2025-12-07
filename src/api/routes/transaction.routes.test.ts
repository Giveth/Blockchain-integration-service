import { expect } from 'chai';
import request from 'supertest';
import sinon from 'sinon';
import { createApp } from '../app';
import { TransactionStatus } from '../../types';
import * as transactionVerificationServiceModule from '../../services/transactionVerificationService';
import * as priceServiceModule from '../../services/priceService';

describe('Transaction Routes', () => {
  const app = createApp();
  let verifyTransactionStub: sinon.SinonStub;
  let verifyTransactionsStub: sinon.SinonStub;
  let getTransactionTimestampStub: sinon.SinonStub;
  let getTokenPriceStub: sinon.SinonStub;

  beforeEach(() => {
    // Mock transaction verification service
    verifyTransactionStub = sinon.stub(
      transactionVerificationServiceModule.transactionVerificationService,
      'verifyTransaction',
    );
    verifyTransactionsStub = sinon.stub(
      transactionVerificationServiceModule.transactionVerificationService,
      'verifyTransactions',
    );
    getTransactionTimestampStub = sinon.stub(
      transactionVerificationServiceModule.transactionVerificationService,
      'getTransactionTimestamp',
    );

    // Mock price service
    getTokenPriceStub = sinon.stub(
      priceServiceModule.priceService,
      'getTokenPrice',
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('POST /api/verify', () => {
    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/verify')
        .send({})
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error).to.equal('Validation failed');
      expect(response.body.details).to.be.an('array');
      expect(response.body.details.length).to.be.greaterThan(0);
      // Service should NOT be called for invalid input
      expect(verifyTransactionStub.called).to.be.false;
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
      expect(response.body.details).to.exist;
      // Service should NOT be called for invalid input
      expect(verifyTransactionStub.called).to.be.false;
    });

    it('should call service with correct parameters and return SUCCESS for valid transaction', async () => {
      const inputTxHash =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const inputTimestamp = Math.floor(Date.now() / 1000);

      const mockResult = {
        isValid: true,
        transaction: {
          hash: inputTxHash,
          from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.5,
          timestamp: inputTimestamp,
          currency: 'ETH',
          status: TransactionStatus.SUCCESS,
        },
      };
      verifyTransactionStub.resolves(mockResult);

      const response = await request(app)
        .post('/api/verify')
        .send({
          txHash: inputTxHash,
          networkId: 1,
          symbol: 'ETH',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.5,
          timestamp: inputTimestamp,
        })
        .expect(200);

      // Verify service was called
      expect(verifyTransactionStub.calledOnce).to.be.true;

      // Verify service was called with correct input
      const serviceInput = verifyTransactionStub.firstCall.args[0];
      expect(serviceInput.txHash).to.equal(inputTxHash);
      expect(serviceInput.networkId).to.equal(1);
      expect(serviceInput.symbol).to.equal('ETH');
      expect(serviceInput.fromAddress).to.equal(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      );
      expect(serviceInput.toAddress).to.equal(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      );
      expect(serviceInput.amount).to.equal(1.5);

      // Verify response structure
      expect(response.body.success).to.be.true;
      expect(response.body.data.status).to.equal(TransactionStatus.SUCCESS);
      expect(response.body.data.transaction).to.exist;
      expect(response.body.data.transaction.hash).to.equal(inputTxHash);
      expect(response.body.data.transaction.amount).to.equal(1.5);
    });

    it('should return FAILED status with error details for invalid transaction', async () => {
      const mockResult = {
        isValid: false,
        error: 'Transaction not found',
        errorCode: 'TRANSACTION_NOT_FOUND',
      };
      verifyTransactionStub.resolves(mockResult);

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
      expect(response.body.data.status).to.equal(TransactionStatus.FAILED);
      expect(response.body.data.error).to.equal('Transaction not found');
      expect(response.body.data.errorCode).to.equal('TRANSACTION_NOT_FOUND');
      // Should not have transaction data when failed
      expect(response.body.data.transaction).to.be.undefined;
    });

    it('should pass optional fields to service', async () => {
      const mockResult = {
        isValid: true,
        transaction: {
          hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.5,
          timestamp: Math.floor(Date.now() / 1000),
          currency: 'ETH',
          status: TransactionStatus.SUCCESS,
        },
      };
      verifyTransactionStub.resolves(mockResult);

      await request(app)
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
          safeTxHash: '0xsafe123',
        })
        .expect(200);

      // Verify optional fields were passed to service
      const serviceInput = verifyTransactionStub.firstCall.args[0];
      expect(serviceInput.isSwap).to.equal(true);
      expect(serviceInput.nonce).to.equal(42);
      expect(serviceInput.safeTxHash).to.equal('0xsafe123');
    });

    it('should handle service errors gracefully', async () => {
      verifyTransactionStub.rejects(new Error('Service unavailable'));

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
        });

      // Should return error response
      expect(response.status).to.be.oneOf([400, 500]);
      expect(response.body.success).to.be.false;
    });
  });

  describe('POST /api/verify-batch', () => {
    it('should return 400 for empty transactions array', async () => {
      const response = await request(app)
        .post('/api/verify-batch')
        .send({ transactions: [] })
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(verifyTransactionsStub.called).to.be.false;
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
      expect(verifyTransactionsStub.called).to.be.false;
    });

    it('should process batch and return correct counts', async () => {
      const mockResults = [
        {
          isValid: true,
          transaction: {
            hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
            amount: 1.0,
            timestamp: Math.floor(Date.now() / 1000),
            currency: 'ETH',
            status: TransactionStatus.SUCCESS,
          },
        },
        {
          isValid: false,
          error: 'Amount mismatch',
          errorCode: 'AMOUNT_MISMATCH',
        },
      ];
      verifyTransactionsStub.resolves(mockResults);

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

      expect(verifyTransactionsStub.calledOnce).to.be.true;
      expect(verifyTransactionsStub.firstCall.args[0]).to.have.lengthOf(2);

      expect(response.body.success).to.be.true;
      expect(response.body.data.total).to.equal(2);
      expect(response.body.data.successful).to.equal(1);
      expect(response.body.data.failed).to.equal(1);
      expect(response.body.data.results).to.have.lengthOf(2);

      // Verify first result is SUCCESS
      expect(response.body.data.results[0].status).to.equal(
        TransactionStatus.SUCCESS,
      );
      expect(response.body.data.results[0].transaction).to.exist;

      // Verify second result is FAILED
      expect(response.body.data.results[1].status).to.equal(
        TransactionStatus.FAILED,
      );
      expect(response.body.data.results[1].error).to.equal('Amount mismatch');
    });
  });

  describe('POST /api/timestamp', () => {
    it('should return 400 for missing txHash', async () => {
      const response = await request(app)
        .post('/api/timestamp')
        .send({ networkId: 1 })
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(getTransactionTimestampStub.called).to.be.false;
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
      expect(getTransactionTimestampStub.called).to.be.false;
    });

    it('should call service with correct parameters and return timestamp', async () => {
      const mockTimestamp = 1700000000;
      const txHash =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      getTransactionTimestampStub.resolves(mockTimestamp);

      const response = await request(app)
        .post('/api/timestamp')
        .send({
          txHash,
          networkId: 1,
        })
        .expect(200);

      // Verify service was called with correct parameters
      expect(getTransactionTimestampStub.calledOnce).to.be.true;
      expect(getTransactionTimestampStub.firstCall.args[0]).to.equal(txHash);
      expect(getTransactionTimestampStub.firstCall.args[1]).to.equal(1);

      // Verify response
      expect(response.body.success).to.be.true;
      expect(response.body.data.timestamp).to.equal(mockTimestamp);
      expect(response.body.data.txHash).to.equal(txHash);
      expect(response.body.data.networkId).to.equal(1);
      expect(response.body.data.date).to.exist;
    });

    it('should handle service errors', async () => {
      getTransactionTimestampStub.rejects(new Error('Transaction not found'));

      const response = await request(app).post('/api/timestamp').send({
        txHash:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        networkId: 1,
      });

      expect(response.status).to.be.oneOf([400, 500]);
      expect(response.body.success).to.be.false;
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
      expect(getTokenPriceStub.called).to.be.false;
    });

    it('should return 400 for missing symbol', async () => {
      const response = await request(app)
        .post('/api/price')
        .send({ networkId: 1 })
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(getTokenPriceStub.called).to.be.false;
    });

    it('should call service with correct parameters for native token', async () => {
      getTokenPriceStub.resolves(2500.5);

      const response = await request(app)
        .post('/api/price')
        .send({
          networkId: 1,
          symbol: 'ETH',
        })
        .expect(200);

      // Verify service was called with correct parameters
      expect(getTokenPriceStub.calledOnce).to.be.true;
      const serviceInput = getTokenPriceStub.firstCall.args[0];
      expect(serviceInput.networkId).to.equal(1);
      expect(serviceInput.symbol).to.equal('ETH');
      expect(serviceInput.tokenAddress).to.be.undefined;

      // Verify response
      expect(response.body.success).to.be.true;
      expect(response.body.data.priceUsd).to.equal(2500.5);
      expect(response.body.data.symbol).to.equal('ETH');
      expect(response.body.data.networkId).to.equal(1);
      expect(response.body.data.tokenAddress).to.be.null;
    });

    it('should pass tokenAddress to service for ERC20 tokens', async () => {
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      getTokenPriceStub.resolves(1.0);

      const response = await request(app)
        .post('/api/price')
        .send({
          networkId: 1,
          symbol: 'USDC',
          tokenAddress,
        })
        .expect(200);

      // Verify tokenAddress was passed to service
      const serviceInput = getTokenPriceStub.firstCall.args[0];
      expect(serviceInput.tokenAddress).to.equal(tokenAddress);

      expect(response.body.success).to.be.true;
      expect(response.body.data.tokenAddress).to.equal(tokenAddress);
    });

    it('should handle null tokenAddress', async () => {
      getTokenPriceStub.resolves(2500.5);

      const response = await request(app)
        .post('/api/price')
        .send({
          networkId: 1,
          symbol: 'ETH',
          tokenAddress: null,
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data.tokenAddress).to.be.null;
    });

    it('should return 0 price when service fails (graceful degradation)', async () => {
      getTokenPriceStub.resolves(0); // Price service returns 0 on failure

      const response = await request(app)
        .post('/api/price')
        .send({
          networkId: 1,
          symbol: 'UNKNOWN_TOKEN',
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data.priceUsd).to.equal(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON with proper error response', async () => {
      const response = await request(app)
        .post('/api/verify')
        .set('Content-Type', 'application/json')
        .send('invalid json{');

      expect(response.status).to.be.oneOf([400, 500]);
      expect(response.body).to.exist;
      expect(response.body.success).to.be.false;
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

    it('should return JSON content type', async () => {
      const mockResult = {
        isValid: true,
        transaction: {
          hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          amount: 1.0,
          timestamp: Math.floor(Date.now() / 1000),
          currency: 'ETH',
          status: TransactionStatus.SUCCESS,
        },
      };
      verifyTransactionStub.resolves(mockResult);

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
        })
        .expect(200);

      expect(response.headers['content-type']).to.match(/json/);
    });
  });
});
