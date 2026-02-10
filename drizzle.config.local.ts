import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './worker/database/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  verbose: true,
  strict: true,
});
