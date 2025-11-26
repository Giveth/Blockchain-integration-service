import { Router, Request, Response } from 'express';
import { config } from '../../config';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '1.0.0',
  });
});

export default router;
