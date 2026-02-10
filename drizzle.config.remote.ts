import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './worker/database/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.DATABASE_PATH || '.data/vibesdk.db',
  },
  verbose: true,
  strict: true,
});
