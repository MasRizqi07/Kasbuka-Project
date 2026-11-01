import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Muat .env untuk pengujian lokal
try {
  process.loadEnvFile?.();
} catch {
  // Abaikan jika .env tidak ada (misalnya di CI di mana env var disuntikkan langsung oleh runner)
}

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
