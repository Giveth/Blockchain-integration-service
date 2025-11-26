import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { transactionVerificationService } from '../../services/transactionVerificationService';
import { validateRequest } from '../middleware/validation';
import { TransactionDetailInput } from '../../types';

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

router.post(
  '/verify',
  validateRequest(verifyTransactionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input: TransactionDetailInput = req.body;
      const result =
        await transactionVerificationService.verifyTransaction(input);

      res.json({
        success: true,
        data: result,
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

      res.json({
        success: true,
        data: {
          total: results.length,
          successful: results.filter((r) => r.isValid).length,
          failed: results.filter((r) => !r.isValid).length,
          results,
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

export default router;
