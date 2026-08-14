import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base: all built asset URLs resolve relative to index.html
  // rather than the domain root. This is what makes the same `dist/`
  // output work unmodified on a GitHub Pages project site (served at
  // /<repo-name>/), a custom domain, or embedded in Canvas LMS at
  // whatever iframe path the LMS mounts it under (spec §4.1, §12.2) —
  // no build-time repo name to keep in sync.
  base: './',
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
