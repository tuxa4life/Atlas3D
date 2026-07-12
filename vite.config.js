/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), svgr()],
    server: {
        port: process.env.PORT ? Number(process.env.PORT) : 3000,
    },
    build: {
        outDir: 'build',
    },
    test: {
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,jsx}'],
    },
})
