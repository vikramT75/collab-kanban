import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV === 'production') {
    next();
    return;
  }

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
  });
  next();
}
