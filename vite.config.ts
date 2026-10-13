/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves a project site from a sub-folder, e.g.
// https://USER.github.io/northbound/  ->  the app must be built with base "/northbound/".
// The deploy workflow passes the repo name in VITE_BASE_PATH so this is always correct,
// whatever the repository ends up being called. Locally it stays "/".
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Only the app shell (HTML/JS/CSS/icons) is precached. Task data is NOT put in the
      // service worker cache on purpose: those responses are made with your personal token
      // and we do not want them sitting in a browser cache. Offline task data is kept in
      // localStorage instead, written by the sync layer (see src/lib/cache.ts).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`,
        // Never let the service worker touch the GitHub API.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Board — Northbound',
        short_name: 'Board',
        description: 'Internal task manager for Northbound. Tasks live in GitHub Issues.',
        theme_color: '#5b7cfa',
        background_color: '#0d1326',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
