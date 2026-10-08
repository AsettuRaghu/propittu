import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // A team tool loaded once; one bundle is fine.
  build: { chunkSizeWarningLimit: 1200 },
});
