import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts', 'implements/**/*.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
})