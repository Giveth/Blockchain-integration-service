import { expect } from 'chai';
import request from 'supertest';
import sinon from 'sinon';
import { createApp } from '../app';
import * as transactionVerificationServiceModule from '../../services/transactionVerificationService';

describe('POST /api/donation-handler-logs (#393 reconciler scan)', () => {
  const app = createApp();
  let getDonationHandlerLogsStub: sinon.SinonStub;

  beforeEach(() => {
    getDonationHandlerLogsStub = sinon.stub(
      transactionVerificationServiceModule.transactionVerificationService,
      'getDonationHandlerLogs',
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('returns 400 when networkId is missing', async () => {
    const response = await request(app)
      .post('/api/donation-handler-logs')
      .send({ fromBlock: 1, toBlock: 2 })
      .expect(400);

    expect(response.body.success).to.be.false;
    expect(response.body.error).to.equal('Validation failed');
    expect(getDonationHandlerLogsStub.called).to.be.false;
  });

  it('returns 400 when only fromBlock is provided (both-or-neither)', async () => {
    const response = await request(app)
      .post('/api/donation-handler-logs')
      .send({ networkId: 137, fromBlock: 100 })
      .expect(400);

    expect(response.body.success).to.be.false;
    expect(getDonationHandlerLogsStub.called).to.be.false;
  });

  it('returns 400 when toBlock is less than fromBlock', async () => {
    const response = await request(app)
      .post('/api/donation-handler-logs')
      .send({ networkId: 137, fromBlock: 200, toBlock: 100 })
      .expect(400);

    expect(response.body.success).to.be.false;
    expect(getDonationHandlerLogsStub.called).to.be.false;
  });

  it('returns 400 when the block range exceeds the max span', async () => {
    const response = await request(app)
      .post('/api/donation-handler-logs')
      .send({ networkId: 137, fromBlock: 0, toBlock: 10_000 }) // 10001 blocks
      .expect(400);

    expect(response.body.success).to.be.false;
    expect(getDonationHandlerLogsStub.called).to.be.false;
  });

  it('accepts a request with no range (latest-only mode)', async () => {
    getDonationHandlerLogsStub.resolves({
      networkId: 137,
      fromBlock: 500,
      toBlock: 500,
      latestBlock: 500,
      logs: [],
    });

    const response = await request(app)
      .post('/api/donation-handler-logs')
      .send({ networkId: 137 })
      .expect(200);

    expect(response.body.success).to.be.true;
    expect(response.body.data.latestBlock).to.equal(500);
    expect(response.body.data.logs).to.deep.equal([]);
    expect(getDonationHandlerLogsStub.calledOnce).to.be.true;
    // Range args forwarded as undefined so the service runs latest-only mode.
    expect(getDonationHandlerLogsStub.firstCall.args).to.deep.equal([
      137,
      undefined,
      undefined,
    ]);
  });

  it('returns decoded logs for a valid range and forwards the range to the service', async () => {
    const mockLog = {
      transactionHash:
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      logIndex: 3,
      blockNumber: 123,
      blockTimestamp: 1_700_000_000,
      from: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0',
      to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      amount: '1000000000000000000',
      isNativeToken: true,
    };
    getDonationHandlerLogsStub.resolves({
      networkId: 137,
      fromBlock: 100,
      toBlock: 200,
      latestBlock: 250,
      logs: [mockLog],
    });

    const response = await request(app)
      .post('/api/donation-handler-logs')
      .send({ networkId: 137, fromBlock: 100, toBlock: 200 })
      .expect(200);

    expect(response.body.success).to.be.true;
    expect(response.body.data.logs).to.have.length(1);
    expect(response.body.data.logs[0].amount).to.equal('1000000000000000000');
    expect(response.body.data.logs[0].logIndex).to.equal(3);
    expect(getDonationHandlerLogsStub.firstCall.args).to.deep.equal([
      137, 100, 200,
    ]);
  });

  it('surfaces a BlockchainError from the service as a 400', async () => {
    // The global error handler maps BlockchainError -> 400 {success,error,code}.
    const { BlockchainError, BlockchainErrorCode } =
      await import('../../types');
    getDonationHandlerLogsStub.rejects(
      new BlockchainError(
        BlockchainErrorCode.UNSUPPORTED_CHAIN,
        'Network 101 is not a supported EVM chain',
        { networkId: 101 },
      ),
    );

    const response = await request(app)
      .post('/api/donation-handler-logs')
      .send({ networkId: 101, fromBlock: 1, toBlock: 2 })
      .expect(400);

    expect(response.body.success).to.be.false;
    expect(response.body.code).to.equal(BlockchainErrorCode.UNSUPPORTED_CHAIN);
  });
});
