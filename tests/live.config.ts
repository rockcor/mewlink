import { defineConfig } from 'vitest/config';

// Needs the ratchet_peer example and wrangler (WRANGLER=<path to wrangler.js>).
export default defineConfig({ test: { include: ['tests/live-typing.integration.ts'], fileParallelism: false } });
