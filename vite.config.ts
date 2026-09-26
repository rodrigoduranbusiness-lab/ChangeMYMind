import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@prompts': fileURLToPath(new URL('./prompts', import.meta.url)),
    },
  },
  preview: {
    allowedHosts: ['changemymind.tech', 'www.changemymind.tech', 'localhost'],
  },
})
