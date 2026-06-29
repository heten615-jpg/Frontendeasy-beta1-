import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const staticBase = process.env.FRONTENDEASY_STATIC_BASE ?? '/'

export default defineConfig(() => ({
  base: staticBase,
  plugins: [svelte()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
