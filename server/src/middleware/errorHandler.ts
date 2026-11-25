import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  if (err?.name === 'ZodError') {
    res.status(400).json({ error: 'Validation error', details: err.errors });
    return;
  }

  if (err?.code === '22P02') {
    res.status(400).json({ error: 'Invalid identifier format' });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: err?.message ?? 'Internal server error' });
}
