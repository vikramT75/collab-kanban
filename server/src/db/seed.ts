import { pool } from './pool';

export async function runSeed(): Promise<void> {
  const { rows } = await pool.query('SELECT COUNT(*) FROM tasks');
  if (parseInt(rows[0].count, 10) > 0) {
    console.log('Seed skipped: tasks table already has data');
    return;
  }

  const tasks: Array<[string, string, string, string, string, number]> = [
    // [title, priority, assignee, status, description, position]
    ['Onboarding flow redesign',       'medium', 'Karan',  'Backlog',     '', 1000],
    ['Analytics dashboard v2',         'low',    'Rahul',  'Backlog',     '', 2000],
    ['Notification preferences page',  'low',    'Ananya', 'Backlog',     '', 3000],
    ['Fix payment gateway bug',        'high',   'Karan',  'Todo',        '', 1000],
    ['Add dark mode support',          'medium', 'Priya',  'Todo',        '', 2000],
    ['Mobile responsiveness audit',    'low',    'Ananya', 'Todo',        '', 3000],
    ['Implement auth service',         'high',   'Rahul',  'In Progress', '', 1000],
    ['Write API documentation',        'low',    'Ananya', 'In Progress', '', 2000],
    ['Set up CI/CD pipeline',          'high',   'Rahul',  'Done',        '', 1000],
    ['Design system tokens',           'medium', 'Priya',  'Done',        '', 2000],
  ];

  for (const [title, priority, assignee, status, description, position] of tasks) {
    await pool.query(
      `INSERT INTO tasks (title, description, priority, assignee, status, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [title, description, priority, assignee, status, position]
    );
  }

  console.log('Seed complete: inserted 10 tasks');
}
