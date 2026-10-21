import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://127.0.0.1:' + (process.env.PORT || 4321);

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-ui', chunkSizeWarningLimit: 4000 },
  server: { port: 5173, proxy: { '/api': api, '/media': api, '/vendor': api } },
});
