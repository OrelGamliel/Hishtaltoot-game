/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { devPackApi } from './scripts/lib/dev-pack-api.mjs';
import { devRemote } from './scripts/lib/dev-remote.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss(), devPackApi({ root: import.meta.dirname }), devRemote()],
  test: {
    environment: 'node',
  },
});
