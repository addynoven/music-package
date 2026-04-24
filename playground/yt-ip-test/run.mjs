/**
 * YouTube IP-binding test
 *
 * Step 1: HOST uses MusicKit.getStream() — gets properly signed CDN URLs
 * Step 2: Docker container reads those URLs and fetches each one (Range 0-1023)
 * Step 3: Report 200/206 (accessible) vs 403 (IP-bound)
 *
 * Limitation: Docker bridge NATs through the host's public IP, so if all pass
 * it likely means both sides share the same external IP — not truly "public".
 * Connect Docker to a VPN or run the fetch from a different machine to confirm.
 */

import { execSync }      from 'node:child_process';
import { existsSync }    from 'node:fs';
import { spawnSync }     from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path              from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_ID  = process.argv[2] ?? 'dQw4w9WgXcQ';
const sdkRoot   = path.join(__dirname, '../..');
const outPath   = path.join(__dirname, 'formats.json');

// ── Step 1: get stream URLs on host via SDK ───────────────────────────────────

console.log(`\n▶  Video ID : ${VIDEO_ID}`);
console.log('▶  Step 1 — fetching stream URLs on host (MusicKit.getStream)...\n');

const hostResult = spawnSync(
  'node',
  [path.join(__dirname, 'get-formats-sdk.mjs'), VIDEO_ID],
  { encoding: 'utf-8', stdio: 'inherit', cwd: sdkRoot },
);

if (hostResult.status !== 0 || !existsSync(outPath)) {
  console.error('\nFailed to fetch stream URLs on host.');
  process.exit(1);
}

// ── Step 2: test URLs from inside Docker ─────────────────────────────────────

console.log('\n▶  Step 2 — testing those URLs from inside Docker (different IP)...\n');

let results;
try {
  const raw = execSync(
    `docker run --rm \
      --network host \
      -v "${__dirname}:/data:ro" \
      node:22-alpine \
      node /data/test-from-docker.mjs`,
    { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 },
  );
  results = JSON.parse(raw.trim());
} catch (err) {
  console.error('Docker step failed:', err.message);
  process.exit(1);
}

// ── Step 3: print results ─────────────────────────────────────────────────────

console.log(`✔  Tested ${results.length} URLs\n`);
console.log('  itag    │ HTTP │ audio  │ video  │ ext  │ label');
console.log('  ────────┼──────┼────────┼────────┼──────┼──────────────────');

for (const r of results) {
  const icon  = r.accessible ? '✅' : r.httpStatus === 403 ? '❌' : '⚠️ ';
  const err   = r.errMsg ? ` (${r.errMsg})` : '';
  console.log(
    `  ${String(r.itag).padEnd(7)} │ ${String(r.httpStatus).padEnd(4)} │` +
    ` ${String(r.hasAudio).padEnd(6)} │ ${String(r.hasVideo).padEnd(6)} │` +
    ` ${String(r.ext ?? '—').padEnd(4)} │ ${r.label ?? '—'}  ${icon}${err}`,
  );
}

const ok      = results.filter(r => r.accessible);
const blocked = results.filter(r => r.httpStatus === 403);

console.log('\n──────────────────────────────────────────────');
console.log(`  Total   : ${results.length}`);
console.log(`  ✅ OK    : ${ok.length}`);
console.log(`  ❌ 403   : ${blocked.length}`);
console.log(`  ⚠️  other : ${results.length - ok.length - blocked.length}`);

if (ok.length > 0 && blocked.length === 0) {
  console.log('\n  All passed — but Docker bridge likely shares your host\'s public IP.');
  console.log('  Can\'t confirm "truly public" without testing from a different external IP.');
}
if (blocked.length > 0) {
  console.log('\n  Some URLs 403 even with same public IP — definitively IP-bound.');
}

console.log('');
