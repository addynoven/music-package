import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  async onSuccess() {
    // esbuild normalises "node:sqlite" → "sqlite" because it strips the node:
    // prefix from built-ins it recognises. node:sqlite is Node 22+ only and
    // has no bare-name equivalent, so we patch the dist files after the build.
    for (const file of ['dist/index.mjs', 'dist/index.js']) {
      const content = readFileSync(file, 'utf-8')
      const patched = content
        .replace(/from "sqlite"/g, 'from "node:sqlite"')
        .replace(/require\("sqlite"\)/g, 'require("node:sqlite")')
      writeFileSync(file, patched)
    }
  },
})
