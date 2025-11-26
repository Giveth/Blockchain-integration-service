import { expect } from 'chai';
import { Request, Response } from 'express';
import { errorHandler } from './errorHandler';
import { BlockchainError, BlockchainErrorCode } from '../../types';

describe('Error Handler Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let responseData: any;

  beforeEach(() => {
    responseData = null;

    req = {
      path: '/test',
      method: 'GET',
    };

    res = {
      status: function (code: number) {
        (this as any).statusCode = code;
        return this as Response;
      },
      json: function (data: any) {
        responseData = data;
        return this as Response;
      },
      statusCode: 200,
    } as Partial<Response>;
  });

  const next = () => {};

  describe('errorHandler', () => {
    it('should handle BlockchainError with 400 status', () => {
      const error = new BlockchainError(
        BlockchainErrorCode.TRANSACTION_NOT_FOUND,
        'Transaction not found',
        { txHash: '0x123' },
      );

      errorHandler(error, req as Request, res as Response, next);

      expect(res.statusCode).to.equal(400);
      expect(responseData.success).to.be.false;
      expect(responseData.error).to.equal('Transaction not found');
      expect(responseData.code).to.equal(
        BlockchainErrorCode.TRANSACTION_NOT_FOUND,
      );
      expect(responseData.details).to.deep.equal({ txHash: '0x123' });
    });

    it('should handle generic Error with 500 status', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, req as Request, res as Response, next);

      expect(res.statusCode).to.equal(500);
      expect(responseData.success).to.be.false;
      expect(responseData.error).to.equal('Internal server error');
      expect(responseData.message).to.equal('Something went wrong');
    });

    it('should handle errors without message', () => {
      const error = new Error();

      errorHandler(error, req as Request, res as Response, next);

      expect(res.statusCode).to.equal(500);
      expect(responseData.success).to.be.false;
    });
  });
});
