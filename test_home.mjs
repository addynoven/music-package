import { Innertube } from 'youtubei.js';

async function run() {
  const yt = await Innertube.create();
  const res = await yt.music.getHomeFeed();
  
  // Find a playlist item with thumbnails
  for (const section of res.sections || []) {
    for (const item of section.contents || []) {
      if (item.type === 'Playlist' || item.type === 'MusicTwoRowItem') {
        const thumb = item.thumbnail?.contents || item.thumbnails || item.thumbnail;
        if (thumb && Array.isArray(thumb) && thumb.length > 0) {
          console.log(thumb[0].url);
          return;
        }
      }
    }
  }
}
run().catch(console.error);
