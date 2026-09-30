import { defineConfig } from 'vitest/config';

// The nested website uses node:test and its own runner.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
