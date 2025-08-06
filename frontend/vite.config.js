import { defineConfig } from 'vite'; 
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig(async () => {
  return {
    base: '/',
    cacheDir: 'node_modules/.vite',
    plugins: [
      react()
    ],
    server: { 
      watch: {
        usePolling: true, 
        interval: 300, 
        ignored: ['**/videos/user-uploads/**']
      },
      https: {
        key: fs.readFileSync('./cert/origin.key'),
        cert: fs.readFileSync('./cert/origin.crt'),
      },
      host: true,
      port: 5173,
      proxy: {
        '/api/upload-game': {
          target: 'https://tus:3002',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'https://backend:3001',
          changeOrigin: true,
          secure: false,
        },
        '/videos': {
          target: 'https://backend:3001',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        react: path.resolve('./node_modules/react'),
      },     
    },
  };
});
