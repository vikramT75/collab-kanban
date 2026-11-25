import { Request, Response, NextFunction } from 'express';

export function chaosMiddleware(req: Request, res: Response, next: NextFunction): void {
  const simulateError = req.headers['x-simulate-error'] === 'true';
  const failureRate = parseFloat(process.env.FAILURE_RATE ?? '0');
  if (simulateError || (failureRate > 0 && Math.random() < failureRate)) {
    res.status(503).json({ error: 'simulated server error' });
    return;
  }
  next();
}
