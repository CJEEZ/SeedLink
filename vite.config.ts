/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'

type VitestConfig = UserConfig & {
  test: {
    globals: boolean
    environment: string
    setupFiles: string
  }
}

// https://vitejs.dev/config/
const config: VitestConfig = {
  plugins: [
    react(),
    legacy()
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  }
}

export default defineConfig(config)
