/**
 * Drizzle client for D1. Import `db()` inside request handlers, never at module top level
 * (bindings are only available at request time).
 */
import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import { schema } from './schema';

export type DB = ReturnType<typeof createDb>;

export function createDb(d1: D1Database = env.DB) {
  return drizzle(d1, { schema });
}

let cached: DB | undefined;
export function db(): DB {
  // One client per isolate; D1 bindings are stable within a Worker instance.
  return (cached ??= createDb());
}

export * from './schema';
