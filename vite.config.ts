import { defineConfig } from 'vitest/config';

export default defineConfig({
  // ścieżki względne – aplikację można wrzucić do dowolnego katalogu na serwerze
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  // abcjs (nuty + syntezator) to ~500 kB – świadomie jeden plik, bez dzielenia
  build: { sourcemap: true, target: 'es2022', chunkSizeWarningLimit: 700 },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
