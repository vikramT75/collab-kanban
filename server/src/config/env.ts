import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL environment variable is required'),
  FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const PORT = env.PORT;
export const DATABASE_URL = env.DATABASE_URL;
export const FAILURE_RATE = env.FAILURE_RATE;
