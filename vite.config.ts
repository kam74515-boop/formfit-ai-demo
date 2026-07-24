import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

declare const process: { env: Record<string, string | undefined> }

export default defineConfig({
  plugins: [react(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  server: {
    host: true,
    port: 5173,
  },
})
