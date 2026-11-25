import pg from 'pg';
import { DATABASE_URL } from '../config/env';

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
});
