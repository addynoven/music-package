// Uses yt-dlp to get properly signed CDN URLs for all formats
// yt-dlp handles decipher + n-param decode natively
import { execSync }    from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_ID  = process.argv[2] ?? 'dQw4w9WgXcQ';
const url       = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

console.log(`[host] dumping all format JSON via yt-dlp for ${VIDEO_ID}...`);

const raw = execSync(
  `yt-dlp --dump-json "${url}"`,
  { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
);

const info    = JSON.parse(raw.trim());
const formats = (info.formats ?? []).filter(f => f.url && f.url.startsWith('http'));

console.log(`[host] got ${formats.length} formats with URLs`);

const entries = formats.map(f => ({
  itag:         f.format_id,
  label:        f.format_note ?? f.format ?? f.format_id,
  ext:          f.ext,
  acodec:       f.acodec,
  vcodec:       f.vcodec,
  hasAudio:     f.acodec !== 'none',
  hasVideo:     f.vcodec !== 'none',
  tbr:          f.tbr ?? 0,
  url:          f.url,
}));

const outPath = path.join(__dirname, 'formats.json');
writeFileSync(outPath, JSON.stringify(entries, null, 2));
console.log(`[host] saved ${entries.length} entries → formats.json`);
