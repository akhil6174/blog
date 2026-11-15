import { defineConfig } from 'vitest/config';

// Unit tests for pure modules only (renderer, decision logic, parsers). Routes and the Workflow are exercised
// end to end against `npm run preview` (see docs/PROGRESS.md verification log).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
