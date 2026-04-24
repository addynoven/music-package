// Runs on HOST — fetches all format URLs and saves to formats.json
import ytdl from '@distube/ytdl-core';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_ID  = process.argv[2] ?? 'dQw4w9WgXcQ';

console.log(`[host] fetching info for ${VIDEO_ID}...`);

const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${VIDEO_ID}`);

const formats = info.formats
  .filter(f => f.url)
  .map(f => ({
    itag:         f.itag,
    mimeType:     f.mimeType ?? '',
    qualityLabel: f.qualityLabel ?? '',
    audioQuality: f.audioQuality ?? '',
    hasAudio:     f.hasAudio,
    hasVideo:     f.hasVideo,
    container:    f.container ?? '',
    codecs:       f.codecs ?? '',
    bitrate:      f.bitrate ?? 0,
    contentLength: f.contentLength ?? '',
    url:          f.url,
  }));

const outPath = path.join(__dirname, 'formats.json');
writeFileSync(outPath, JSON.stringify(formats, null, 2));
console.log(`[host] saved ${formats.length} formats → ${outPath}`);
