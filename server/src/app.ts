import express from 'express';
import cors from 'cors';
import boardRouter from './routes/board';
import tasksRouter from './routes/tasks';
import eventsRouter from './routes/events';
import healthRouter from './routes/health';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: '*',
      allowedHeaders: ['Content-Type', 'X-Client-Id', 'X-Simulate-Error'],
      exposedHeaders: ['X-Client-Id', 'X-Task-Version'],
    })
  );
  app.use(express.json());
  app.use(requestLogger);

  app.use('/api', boardRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api', eventsRouter);
  app.use('/api', healthRouter);
  app.use(errorHandler);

  return app;
}
