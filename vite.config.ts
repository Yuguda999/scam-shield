/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Builds the Chrome extension into dist/ext (load it via chrome://extensions → Load unpacked).
export default defineConfig({
  build: {
    outDir: 'dist/ext',
    emptyOutDir: true,
    sourcemap: true,
    target: 'chrome139',
    rollupOptions: {
      input: {
        sidepanel: 'src/ext/sidepanel.html',
        background: 'src/ext/background.ts',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
