import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../config';
import { logger } from '../utils/logger';
import transactionRoutes from './routes/transaction.routes';
import healthRoutes from './routes/health.routes';
import chainsRoutes from './routes/chains.routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Health check
  app.use('/api/health', healthRoutes);

  // API routes: /chains, /verify, /verify-batch, /timestamp, /price
  app.use('/api/chains', chainsRoutes);
  app.use('/api', transactionRoutes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
    });
  });

  app.use(errorHandler);

  return app;
}

export function startServer(): void {
  const app = createApp();
  const port = config.port;

  app.listen(port, () => {
    logger.info(`Server started on port ${port}`, {
      environment: config.nodeEnv,
      port,
    });
  });
}
