import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * HTTPS dla serwera dev (`npm run dev:https`) – potrzebne, żeby telefon w sieci
 * lokalnej dał dostęp do mikrofonu. Certyfikat samopodpisany tworzy `npm run cert`
 * (openssl, katalog .cert/ – nie trafia do gita).
 */
function devHttps() {
  if (process.env.HTTPS !== '1') return undefined;
  if (!existsSync('.cert/key.pem') || !existsSync('.cert/cert.pem')) {
    throw new Error('Brak certyfikatu – uruchom najpierw: npm run cert');
  }
  return { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') };
}

export default defineConfig({
  // ścieżki względne – aplikację można wrzucić do dowolnego katalogu na serwerze
  base: './',
  server: { host: true, port: 5173, https: devHttps() },
  preview: { host: true, port: 4173 },
  // abcjs (nuty + syntezator) to ~500 kB – świadomie jeden plik, bez dzielenia
  build: { sourcemap: true, target: 'es2022', chunkSizeWarningLimit: 700 },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
