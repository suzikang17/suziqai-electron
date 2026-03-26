import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['tests/**/*.test.{ts,tsx}'],
    deps: {
      interopDefault: true,
    },
    server: {
      deps: {
        external: ['@anthropic-ai/claude-code'],
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@anthropic-ai/claude-code': path.resolve(__dirname, 'tests/__mocks__/@anthropic-ai/claude-code.ts'),
    },
  },
});
