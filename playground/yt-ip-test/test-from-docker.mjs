// Runs INSIDE Docker — reads formats.json and tests each URL
import { readFileSync } from 'node:fs';

const entries = JSON.parse(readFileSync('/data/formats.json', 'utf-8'));
process.stderr.write(`[docker] testing ${entries.length} URLs...\n`);

const results = [];

for (const entry of entries) {
  let status = 'ERR';
  let accessible = false;
  let errMsg = '';

  try {
    const res = await fetch(entry.url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      signal: AbortSignal.timeout(12_000),
    });
    await res.body?.cancel();
    status     = res.status;
    accessible = status === 200 || status === 206;
  } catch (err) {
    errMsg = err.message.slice(0, 40);
  }

  results.push({ ...entry, url: undefined, httpStatus: status, accessible, errMsg });
}

process.stdout.write(JSON.stringify(results));
