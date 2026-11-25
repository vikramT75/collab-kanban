import { Router } from 'express';
import { registerClient, unregisterClient } from '../services/sseHub';

const router = Router();

router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const connectionId = registerClient(res);
  req.on('close', () => unregisterClient(connectionId));
});

export default router;
