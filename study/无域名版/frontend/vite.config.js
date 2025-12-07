import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './join.html',
        room: './index.html'
      }
    }
  },
  server: {
    port: 5500,
    open: '/join.html',
    cors: true,
    host: '0.0.0.0',
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'study.zjbstudy.top'
    ]
  },
  preview: {
    port: 5500
  }
});
