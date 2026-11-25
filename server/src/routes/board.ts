import { Router } from 'express';
import { getAllTasks } from '../services/taskService';
import { COLUMN_ORDER } from '../../../shared/types';

const router = Router();

router.get('/board', async (req, res, next) => {
  try {
    const tasks = await getAllTasks();
    // Strip version field from tasks before sending (not part of Task type)
    const sanitized = tasks.map(({ version, ...t }) => t);
    res.json({ columns: COLUMN_ORDER, tasks: sanitized, serverTime: new Date().toISOString() });
  } catch (err) { next(err); }
});

export default router;
