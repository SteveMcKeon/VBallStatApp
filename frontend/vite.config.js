import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function resolveHttps() {
  const candidates = [
    process.env.VITE_CERT_DIR,
    path.resolve(__dirname, 'cert'),
    path.resolve(__dirname, '../cert'),
  ].filter(Boolean);

  for (const dir of candidates) {
    const key = path.join(dir, 'origin.key');
    const crt = path.join(dir, 'origin.crt');
    if (fs.existsSync(key) && fs.existsSync(crt)) {
      return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
    }
  }
  return undefined;
}

export default defineConfig(({ command }) => {
  const isServe = command === 'serve'
  const cfg = {
    base: '/',
    cacheDir: 'node_modules/.vite',
    plugins: [react()],
    define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
    server: isServe ? {
      watch: { usePolling: true, interval: 300, ignored: ['**/videos/user-uploads/**'] },
      https: resolveHttps(),
      host: true,
      port: 5173,
      proxy: {
        '/api/upload-game': { target: 'https://tus:3002', changeOrigin: true, secure: false },
        '/api': { target: 'https://backend:3001', changeOrigin: true, secure: false },
        '/videos': { target: 'https://backend:3001', changeOrigin: true, secure: false },
      },
    } : undefined,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        react: path.resolve('./node_modules/react'),
      },
    },
  }
  if (!isServe) {
    cfg.envDir = path.resolve(__dirname, '..')
  }
  return cfg
})
