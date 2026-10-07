import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { transactionVerificationService } from '../../services/transactionVerificationService';
import { priceService } from '../../services/priceService';
import { validateRequest } from '../middleware/validation';
import {
  Erc721OwnershipCheckInput,
  TransactionDetailInput,
  TransactionVerificationResult,
  TransactionValidationResult,
  TransactionStatus,
} from '../../types';

const router = Router();

const verifyTransactionSchema = Joi.object({
  txHash: Joi.string().when('safeTxHash', {
    is: Joi.exist(),
    then: Joi.optional().allow(''),
    otherwise: Joi.required(),
  }),
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
  tokenAddress: Joi.string().allow(null).optional(),
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

const erc721OwnershipSchema = Joi.object({
  networkId: Joi.number().required(),
  walletAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required(),
  contractAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required(),
});

// Max block span per DonationMade scan request. Kept below common free-tier RPC
// eth_getLogs limits (dRPC ~10k) so the core reconciler can chunk safely.
const MAX_DONATION_LOGS_BLOCK_SPAN = 10000;

const donationHandlerLogsSchema = Joi.object({
  networkId: Joi.number().integer().positive().required(),
  fromBlock: Joi.number().integer().min(0),
  // toBlock must be >= fromBlock and within MAX_DONATION_LOGS_BLOCK_SPAN of it.
  toBlock: Joi.number()
    .integer()
    .min(Joi.ref('fromBlock'))
    .max(
      Joi.ref('fromBlock', {
        adjust: (value) => value + MAX_DONATION_LOGS_BLOCK_SPAN - 1,
      }),
    ),
})
  // fromBlock/toBlock are both-or-neither; omitting both = "latest-only" mode.
  .and('fromBlock', 'toBlock');

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

router.post(
  '/donation-handler-logs',
  validateRequest(donationHandlerLogsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { networkId, fromBlock, toBlock } = req.body;
      const result =
        await transactionVerificationService.getDonationHandlerLogs(
          networkId,
          fromBlock,
          toBlock,
        );

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
  '/nft/erc721/ownership',
  validateRequest(erc721OwnershipSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input: Erc721OwnershipCheckInput = req.body;
      const ownsNft =
        await transactionVerificationService.checkErc721Ownership(input);

      res.json({
        success: true,
        data: {
          ownsNft,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
