// Runs INSIDE Docker — fetches all format URLs for a video and prints JSON
import ytdl from '@distube/ytdl-core';

const VIDEO_ID = process.env.VIDEO_ID || 'dQw4w9WgXcQ';

process.stderr.write(`[docker] fetching info for ${VIDEO_ID}...\n`);

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

process.stdout.write(JSON.stringify(formats));
process.stderr.write(`[docker] exported ${formats.length} formats\n`);
