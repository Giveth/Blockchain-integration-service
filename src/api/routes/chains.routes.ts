import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { NETWORK_CONFIGS, getNetworkConfig } from '../../config/networks';
import { ChainConfig } from '../../types';
import { validateRequest } from '../middleware/validation';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * Convert internal NetworkConfig to external ChainConfig format
 */
function toChainConfig(networkId: number): ChainConfig | null {
  try {
    const config = getNetworkConfig(networkId);
    return {
      id: config.id,
      name: config.name,
      nativeCurrency: config.nativeCurrency,
      blockExplorerUrl: config.blockExplorerUrl || '',
      isActive: config.isActive !== false, // Default to true if not specified
    };
  } catch {
    return null;
  }
}

/**
 * GET /chains
 * Returns all supported chains
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const chains: ChainConfig[] = [];

    for (const networkId of Object.keys(NETWORK_CONFIGS)) {
      const chainConfig = toChainConfig(Number(networkId));
      if (chainConfig) {
        chains.push(chainConfig);
      }
    }

    logger.debug('Returning supported chains', { count: chains.length });

    res.json({
      success: true,
      data: {
        chains,
      },
    });
  } catch (error) {
    next(error);
  }
});

const getChainByIdSchema = Joi.object({
  networkId: Joi.number().required(),
});

/**
 * GET /chains/:networkId
 * Returns a specific chain configuration
 */
router.get(
  '/:networkId',
  validateRequest(getChainByIdSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const networkId = Number(req.params.networkId);
      const chainConfig = toChainConfig(networkId);

      if (!chainConfig) {
        res.status(404).json({
          success: false,
          error: `Chain not found: ${networkId}`,
          code: 'CHAIN_NOT_FOUND',
        });
        return;
      }

      res.json({
        success: true,
        data: chainConfig,
      });
    } catch (error) {
      next(error);
    }
  },
);

const getTransactionUrlSchema = Joi.object({
  networkId: Joi.number().required(),
  txHash: Joi.string().required(),
});

/**
 * GET /chains/:networkId/transaction-url/:txHash
 * Returns the block explorer URL for a transaction
 */
router.get(
  '/:networkId/transaction-url/:txHash',
  validateRequest(getTransactionUrlSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const networkId = Number(req.params.networkId);
      const { txHash } = req.params;

      const chainConfig = toChainConfig(networkId);

      if (!chainConfig || !chainConfig.blockExplorerUrl) {
        res.status(404).json({
          success: false,
          error: `Chain not found or no block explorer configured: ${networkId}`,
          code: 'CHAIN_NOT_FOUND',
        });
        return;
      }

      const url = `${chainConfig.blockExplorerUrl}/tx/${txHash}`;

      logger.debug('Generated transaction URL', { networkId, txHash, url });

      res.json({
        success: true,
        data: {
          url,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
