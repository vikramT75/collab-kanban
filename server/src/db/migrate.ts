import { pool } from './pool';

export async function runMigration(): Promise<void> {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE TABLE IF NOT EXISTS tasks (
      id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT             NOT NULL CHECK (char_length(trim(title)) > 0),
      description TEXT             NOT NULL DEFAULT '',
      priority    TEXT             NOT NULL DEFAULT 'medium'
                                     CHECK (priority IN ('low', 'medium', 'high')),
      assignee    TEXT             NOT NULL DEFAULT '',
      status      TEXT             NOT NULL DEFAULT 'Backlog'
                                     CHECK (status IN ('Backlog', 'Todo', 'In Progress', 'Done')),
      position    DOUBLE PRECISION NOT NULL,
      version     INTEGER          NOT NULL DEFAULT 1,
      created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks (status, position ASC, id ASC);
  `);
  console.log('Migration complete');
}
