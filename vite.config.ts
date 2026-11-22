/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type UserConfig } from 'vite';

/**
 * Two targets:
 *   vite build              -> dist/ext  Chrome extension (Load unpacked). App Check: debug token from .env.local.
 *   vite build --mode web   -> dist/web  Hosted web app. App Check: reCAPTCHA v3 site key from .env.web.
 *
 * The public web build must never contain the App Check debug token, so it is
 * blanked out with `define` whenever a reCAPTCHA site key is configured.
 * `--mode web-dev` keeps the debug token for local testing of the web page.
 */
export default defineConfig(({ mode }) => {
  const web = mode === 'web' || mode === 'web-dev';
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const publicWeb = mode === 'web' && Boolean(env.VITE_RECAPTCHA_SITE_KEY);

  const define: Record<string, string> = publicWeb ? { 'import.meta.env.VITE_APPCHECK_DEBUG_TOKEN': '""' } : {};
  const build: UserConfig['build'] = web
      ? {
          outDir: 'dist/web',
          emptyOutDir: true,
          target: 'es2022',
          rollupOptions: { input: { index: 'index.html' } },
        }
      : {
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
        };

  return {
    publicDir: web ? 'web/public' : 'public',
    define,
    build,
    test: { include: ['src/**/*.test.ts'] },
  };
});
