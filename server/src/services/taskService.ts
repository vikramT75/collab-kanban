import { randomUUID } from 'crypto';
import { pool } from '../db/pool';
import { Task, TaskWithVersion, ColumnStatus, Priority } from '../../../shared/types';

function rowToTaskWithVersion(row: any): TaskWithVersion {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority as Priority,
    assignee: row.assignee,
    status: row.status as ColumnStatus,
    position: Number(row.position),
    updatedAt: (row.updated_at as Date).toISOString(),
    version: Number(row.version),
  };
}

export async function getAllTasks(): Promise<TaskWithVersion[]> {
  const { rows } = await pool.query(
    'SELECT * FROM tasks ORDER BY status, position ASC, id ASC'
  );
  return rows.map(rowToTaskWithVersion);
}

export async function createTask(
  input: {
    title: string;
    description: string;
    priority: Priority;
    assignee: string;
    status: ColumnStatus;
    position?: number;
  },
  originClientId: string
): Promise<TaskWithVersion> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let newPos: number;
    if (input.position !== undefined) {
      newPos = input.position;
    } else {
      const maxRes = await client.query(
        'SELECT COALESCE(MAX(position), 0) AS max_pos FROM tasks WHERE status = $1',
        [input.status]
      );
      newPos = Number(maxRes.rows[0].max_pos) + 1000;
    }

    const { rows } = await client.query(
      `INSERT INTO tasks (title, description, priority, assignee, status, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.title, input.description, input.priority, input.assignee, input.status, newPos]
    );

    const task = rowToTaskWithVersion(rows[0]);

    const event = {
      type: 'task:created',
      eventId: randomUUID(),
      originClientId,
      task,
    };
    await client.query('SELECT pg_notify($1, $2)', ['kanban_events', JSON.stringify(event)]);

    await client.query('COMMIT');
    return task;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateTask(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    priority: Priority;
    assignee: string;
    status: ColumnStatus;
    position: number;
  }>,
  originClientId: string
): Promise<TaskWithVersion | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const selectRes = await client.query(
      'SELECT * FROM tasks WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (selectRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const current = rowToTaskWithVersion(selectRes.rows[0]);
    const effectivePatch = { ...patch };

    // If moving to a new column via status dropdown without explicit position,
    // place the task cleanly at the bottom of the target column.
    if (
      effectivePatch.status !== undefined &&
      effectivePatch.status !== current.status &&
      effectivePatch.position === undefined
    ) {
      const maxRes = await client.query(
        'SELECT COALESCE(MAX(position), 0) AS max_pos FROM tasks WHERE status = $1 AND id != $2',
        [effectivePatch.status, id]
      );
      effectivePatch.position = Number(maxRes.rows[0].max_pos) + 1000;
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    const patchableFields = ['title', 'description', 'priority', 'assignee', 'status', 'position'] as const;
    type PatchField = typeof patchableFields[number];

    for (const field of patchableFields) {
      if (effectivePatch[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(effectivePatch[field]);
      }
    }

    setClauses.push('version = version + 1');
    setClauses.push('updated_at = NOW()');

    params.push(id);
    const whereIdx = paramIdx;

    const updateRes = await client.query(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${whereIdx} RETURNING *`,
      params
    );
    const updated = rowToTaskWithVersion(updateRes.rows[0]);

    // Compute changed fields comparing before and after the update
    const changedFields: Array<keyof Task> = [];
    const compareFields: PatchField[] = ['title', 'description', 'priority', 'assignee', 'status', 'position'];
    for (const key of compareFields) {
      if (updated[key] !== current[key]) {
        changedFields.push(key);
      }
    }
    changedFields.push('updatedAt');

    // Emit task:updated BEFORE rebalanceColumn so subscribers receive updates in strict version order
    const updateEvent = {
      type: 'task:updated',
      eventId: randomUUID(),
      originClientId,
      task: updated,
      changedFields,
    };
    await client.query('SELECT pg_notify($1, $2)', ['kanban_events', JSON.stringify(updateEvent)]);

    let finalTask = updated;

    // Check if fractional gap in target column dropped below 0.001
    if (effectivePatch.position !== undefined || effectivePatch.status !== undefined) {
      const newStatus = updated.status;
      const neighborRes = await client.query(
        'SELECT position FROM tasks WHERE status = $1 AND id != $2 ORDER BY position ASC, id ASC',
        [newStatus, id]
      );

      const positions = neighborRes.rows.map((r: any) => Number(r.position));
      const newPos = updated.position;

      // Trigger rebalance if gap to ANY neighbor (including exact duplicates) drops below 0.001
      const tooCloseToNeighbor = positions.some(
        (p: number) => Math.abs(p - newPos) < 0.001
      );

      if (tooCloseToNeighbor) {
        await rebalanceColumn(client, newStatus, originClientId);
        const finalRes = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);
        finalTask = rowToTaskWithVersion(finalRes.rows[0]);
      }
    }

    await client.query('COMMIT');
    return finalTask;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteTask(id: string, originClientId: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING id',
      [id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const event = {
      type: 'task:deleted',
      eventId: randomUUID(),
      originClientId,
      taskId: id,
    };
    await client.query('SELECT pg_notify($1, $2)', ['kanban_events', JSON.stringify(event)]);

    await client.query('COMMIT');
    return id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rebalanceColumn(
  client: any,
  status: ColumnStatus,
  originClientId: string
): Promise<void> {
  const { rows } = await client.query(
    'SELECT id FROM tasks WHERE status = $1 ORDER BY position ASC, id ASC',
    [status]
  );

  const positions: Array<{ id: string; position: number; version: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const newPos = (i + 1) * 1000;
    const updateRes = await client.query(
      'UPDATE tasks SET position = $1, version = version + 1 WHERE id = $2 RETURNING id, version',
      [newPos, rows[i].id]
    );
    positions.push({
      id: rows[i].id,
      position: newPos,
      version: Number(updateRes.rows[0].version),
    });
  }

  // Chunk notifications into batches of 80 so pg_notify stays well under Postgres's 8000-byte limit
  const CHUNK_SIZE = 80;
  for (let offset = 0; offset < positions.length; offset += CHUNK_SIZE) {
    const chunk = positions.slice(offset, offset + CHUNK_SIZE);
    const event = {
      type: 'board:rebalanced',
      eventId: randomUUID(),
      originClientId,
      status,
      positions: chunk,
    };
    await client.query('SELECT pg_notify($1, $2)', ['kanban_events', JSON.stringify(event)]);
  }
}
