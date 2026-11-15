/// <reference types="astro/client" />

// Bindings and vars are typed by worker-configuration.d.ts (generated with `npm run generate-types`).
// Read them in routes with:  import { env } from 'cloudflare:workers';
// Astro 6+ no longer exposes them on Astro.locals.runtime.env.

declare namespace App {
  interface Locals {
    user: import('./lib/auth').SessionUser | null;
    session: Record<string, unknown> | null;
  }
}
