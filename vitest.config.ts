import path from 'path';
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**'],
    setupFiles: ['tests/matchers/index.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, './src'),
      '@gen': path.resolve(__dirname, './gen'),
      '@tests': path.resolve(__dirname, './tests'),
    }
  }
});
