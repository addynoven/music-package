import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  // essentia.js ships a UMD bundle that misbehaves when inlined into our build —
  // the `module.exports = factory()` branch can fail to fire in vm contexts (e.g.
  // vitest), causing `Essentia` to be undefined at consumer sites. Mark external
  // so the dist's `require('essentia.js')` resolves at runtime in the consumer's
  // node_modules instead. essentia.js is a runtime dependency in package.json.
  external: ['essentia.js'],
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
