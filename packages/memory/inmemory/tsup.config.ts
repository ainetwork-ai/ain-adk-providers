import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts', 'models/**/*.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
})
