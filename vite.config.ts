import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base: all built asset URLs resolve relative to each page's
  // own HTML file rather than the domain root. This is what makes the
  // same `dist/` output work unmodified on a GitHub Pages project site
  // (served at /<repo-name>/), a custom domain, or embedded in Canvas LMS
  // at whatever iframe path the LMS mounts it under (spec §4.1, §12.2) —
  // no build-time repo name to keep in sync.
  base: './',
  build: {
    // Multi-page app: the 1D trolley lab (index.html) and the 2D overhead
    // gantry lab (gantry.html) are separate pages sharing this one repo
    // and build — both need to be listed explicitly, or `vite build`
    // only emits index.html and gantry.html would 404 on the deployed site.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gantry: resolve(__dirname, 'gantry.html'),
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
