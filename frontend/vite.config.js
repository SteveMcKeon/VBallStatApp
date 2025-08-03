import { defineConfig } from 'vite'; 
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  cacheDir: 'node_modules/.vite',
  plugins: [react()],
  server: { 
    watch: {
      usePolling: true, 
      interval: 300, 
    },   
  https: {
    key: fs.readFileSync('./cert/origin.key'),
    cert: fs.readFileSync('./cert/origin.crt'),
  },
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      } 
    } 
  },  
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      react: path.resolve('./node_modules/react'),
    },     
  },
});          