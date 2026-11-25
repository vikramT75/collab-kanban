import { Router } from 'express';
import { z } from 'zod';
import { chaosMiddleware } from '../middleware/chaos';
import { createTask, updateTask, deleteTask } from '../services/taskService';

const router = Router();

const UuidSchema = z.string().uuid();

const CreateTaskSchema = z.object({
  title:       z.string().trim().min(1, 'Title cannot be empty').max(500),
  description: z.string().default(''),
  priority:    z.enum(['low', 'medium', 'high']).default('medium'),
  assignee:    z.string().trim().default(''),
  status:      z.enum(['Backlog', 'Todo', 'In Progress', 'Done']).default('Backlog'),
  position:    z.number().finite().optional(),
});

const PatchTaskSchema = z.object({
  title:       z.string().trim().min(1, 'Title cannot be empty').max(500).optional(),
  description: z.string().optional(),
  priority:    z.enum(['low', 'medium', 'high']).optional(),
  assignee:    z.string().trim().optional(),
  status:      z.enum(['Backlog', 'Todo', 'In Progress', 'Done']).optional(),
  position:    z.number().finite().optional(),
});

// POST /api/tasks
router.post('/', chaosMiddleware, async (req, res, next) => {
  try {
    const input = CreateTaskSchema.parse(req.body);
    const originClientId = (req.headers['x-client-id'] as string) || 'unknown';
    const task = await createTask(input, originClientId);
    const { version, ...taskOut } = task;
    res.setHeader('X-Task-Version', String(version));
    res.status(201).json(taskOut);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tasks/:id
router.patch('/:id', chaosMiddleware, async (req, res, next) => {
  try {
    const id = UuidSchema.parse(req.params.id);
    const patch = PatchTaskSchema.parse(req.body);
    const originClientId = (req.headers['x-client-id'] as string) || 'unknown';
    const task = await updateTask(id, patch, originClientId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const { version, ...taskOut } = task;
    res.setHeader('X-Task-Version', String(version));
    res.json(taskOut);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', chaosMiddleware, async (req, res, next) => {
  try {
    const id = UuidSchema.parse(req.params.id);
    const originClientId = (req.headers['x-client-id'] as string) || 'unknown';
    const deletedId = await deleteTask(id, originClientId);
    if (!deletedId) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ id: deletedId });
  } catch (err) {
    next(err);
  }
});

export default router;
