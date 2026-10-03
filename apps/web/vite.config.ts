import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Gọi /api sẽ được chuyển tới backend NestJS
    proxy: { '/api': 'http://localhost:3000' },
  },
});
