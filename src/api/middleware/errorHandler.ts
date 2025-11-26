import { Request, Response, NextFunction } from 'express';
import { BlockchainError } from '../../types';
import { logger } from '../../utils/logger';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  if (error instanceof BlockchainError) {
    res.status(400).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message,
  });
}
