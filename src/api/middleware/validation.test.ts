import { expect } from 'chai';
import { Request, Response } from 'express';
import Joi from 'joi';
import { validateRequest } from './validation';

describe('Validation Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let nextCalled: boolean;
  let responseData: any;

  beforeEach(() => {
    nextCalled = false;
    responseData = null;

    req = {
      body: {},
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

  const next = () => {
    nextCalled = true;
  };

  describe('validateRequest', () => {
    it('should call next() for valid data', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      req.body = { name: 'John', age: 30 };

      const middleware = validateRequest(schema);
      middleware(req as Request, res as Response, next);

      expect(nextCalled).to.be.true;
      expect(responseData).to.be.null;
    });

    it('should return 400 for invalid data', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      req.body = { name: 'John' }; // Missing age

      const middleware = validateRequest(schema);
      middleware(req as Request, res as Response, next);

      expect(nextCalled).to.be.false;
      expect(res.statusCode).to.equal(400);
      expect(responseData).to.exist;
      expect(responseData.success).to.be.false;
      expect(responseData.error).to.equal('Validation failed');
      expect(responseData.details).to.be.an('array');
    });

    it('should return validation details for multiple errors', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
        email: Joi.string().email().required(),
      });

      req.body = {}; // Missing all fields

      const middleware = validateRequest(schema);
      middleware(req as Request, res as Response, next);

      expect(responseData.details).to.have.lengthOf(3);
      expect(responseData.details[0]).to.have.property('field');
      expect(responseData.details[0]).to.have.property('message');
    });

    it('should strip unknown fields', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      req.body = { name: 'John', extra: 'field' };

      const middleware = validateRequest(schema);
      middleware(req as Request, res as Response, next);

      expect(nextCalled).to.be.true;
    });
  });
});
