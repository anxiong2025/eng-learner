import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 切换后端: 本地 http://localhost:8080 | 远程 https://eng-learner-production.up.railway.app
const API_TARGET = process.env.API_TARGET || 'https://eng-learner-production.up.railway.app'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: API_TARGET.startsWith('https'),
      },
    },
  },
})
