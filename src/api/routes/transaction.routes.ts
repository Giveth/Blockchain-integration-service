import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { transactionVerificationService } from '../../services/transactionVerificationService';
import { priceService } from '../../services/priceService';
import { validateRequest } from '../middleware/validation';
import {
  TransactionDetailInput,
  TransactionVerificationResult,
  TransactionValidationResult,
  TransactionStatus,
} from '../../types';

const router = Router();

const verifyTransactionSchema = Joi.object({
  txHash: Joi.string().required(),
  symbol: Joi.string().required(),
  networkId: Joi.number().required(),
  fromAddress: Joi.string().required(),
  toAddress: Joi.string().required(),
  amount: Joi.number().required(),
  timestamp: Joi.number().required(),
  safeTxHash: Joi.string().optional(),
  nonce: Joi.number().optional(),
  chainType: Joi.string().optional(),
  isSwap: Joi.boolean().optional(),
  importedFromDraftOrBackupService: Joi.boolean().optional(),
});

const batchVerifyTransactionSchema = Joi.object({
  transactions: Joi.array()
    .items(verifyTransactionSchema)
    .min(1)
    .max(100)
    .required(),
});

const getTimestampSchema = Joi.object({
  txHash: Joi.string().required(),
  networkId: Joi.number().required(),
});

const getPriceSchema = Joi.object({
  networkId: Joi.number().required(),
  symbol: Joi.string().required(),
  tokenAddress: Joi.string().allow(null).optional(),
});

/**
 * Transform internal validation result to external verification result format
 */
function toVerificationResult(
  result: TransactionValidationResult,
): TransactionVerificationResult {
  if (result.isValid && result.transaction) {
    return {
      status: result.transaction.status || TransactionStatus.SUCCESS,
      transaction: {
        hash: result.transaction.hash,
        from: result.transaction.from,
        to: result.transaction.to,
        amount: result.transaction.amount,
        timestamp: result.transaction.timestamp,
      },
    };
  }

  return {
    status: TransactionStatus.FAILED,
    error: result.error,
    errorCode: result.errorCode,
  };
}

router.post(
  '/verify',
  validateRequest(verifyTransactionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input: TransactionDetailInput = req.body;
      const result =
        await transactionVerificationService.verifyTransaction(input);

      // Transform to external format
      const verificationResult = toVerificationResult(result);

      res.json({
        success: true,
        data: verificationResult,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/verify-batch',
  validateRequest(batchVerifyTransactionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transactions } = req.body;
      const results =
        await transactionVerificationService.verifyTransactions(transactions);

      // Transform all results to external format
      const verificationResults = results.map(toVerificationResult);

      res.json({
        success: true,
        data: {
          total: verificationResults.length,
          successful: verificationResults.filter(
            (r) => r.status === TransactionStatus.SUCCESS,
          ).length,
          failed: verificationResults.filter(
            (r) => r.status !== TransactionStatus.SUCCESS,
          ).length,
          results: verificationResults,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/timestamp',
  validateRequest(getTimestampSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { txHash, networkId } = req.body;
      const timestamp =
        await transactionVerificationService.getTransactionTimestamp(
          txHash,
          networkId,
        );

      res.json({
        success: true,
        data: {
          txHash,
          networkId,
          timestamp,
          date: new Date(timestamp * 1000).toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/price',
  validateRequest(getPriceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { networkId, symbol, tokenAddress } = req.body;
      const priceUsd = await priceService.getTokenPrice({
        networkId,
        symbol,
        tokenAddress,
      });

      res.json({
        success: true,
        data: {
          networkId,
          symbol,
          tokenAddress: tokenAddress || null,
          priceUsd,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
