/**
 * Explores youtubei.js API shapes before wiring into src/.
 * Run: pnpm tsx playground/explore-youtubei.ts
 */

import { Innertube } from 'youtubei.js'
import { Platform } from 'youtubei.js/agnostic'
import vm from 'node:vm'

const VIDEO_ID = 'Mnu5-meFyfI' // Dancin (Krono Remix)

async function main() {
  console.log('Creating Innertube session...')
  const yt = await Innertube.create({ generate_session_locally: true })
  console.log('Session OK')

  // Patch the eval to use Node's vm module for cipher decryption
  Platform.load({
    ...Platform.shim,
    eval: (data: any, env: any) => {
      const script = data.output ?? data
      const fn = new Function(...Object.keys(env), script)
      return fn(...Object.values(env))
    },
  })
  console.log('VM evaluator patched\n')

  // ── Search ────────────────────────────────────────────────────────────────
  console.log('=== SEARCH (songs) ===')
  const searchRes = await yt.music.search('Dancin Krono Remix', { type: 'song' })
  const firstSong = searchRes.contents?.[0]?.contents?.[0] as any
  console.log('videoId:', firstSong?.id)
  console.log('title:', firstSong?.title)
  console.log('artist:', firstSong?.artists?.[0]?.name)
  console.log('duration (s):', firstSong?.duration?.seconds)
  console.log('thumbnail:', firstSong?.thumbnail?.contents?.[0]?.url?.slice(0, 60))

  // ── Suggestions ───────────────────────────────────────────────────────────
  console.log('\n=== SUGGESTIONS ===')
  const sugg = await yt.music.getSearchSuggestions('dancin')
  const texts = (sugg as any[]).flatMap((s: any) =>
    s.contents?.map((c: any) => c.suggestion?.text ?? c.query?.text).filter(Boolean) ?? []
  )
  console.log('suggestions:', texts.slice(0, 5))

  // ── Stream ────────────────────────────────────────────────────────────────
  console.log('\n=== STREAM RESOLUTION ===')
  const info = await yt.music.getInfo(VIDEO_ID)
  const allFmts = info.streaming_data?.adaptive_formats ?? []
  const audioFmts = allFmts.filter(f => f.has_audio && !f.has_video)
  console.log('total adaptive formats:', allFmts.length)
  console.log('audio-only formats:', audioFmts.length)

  const best = audioFmts.sort((a, b) => b.bitrate - a.bitrate)[0] as any
  console.log('best itag:', best?.itag)
  console.log('best mime:', best?.mime_type)
  console.log('best bitrate:', best?.bitrate)
  console.log('has direct url:', !!best?.url)
  console.log('needs decipher:', !!best?.signature_cipher || !!best?.cipher)

  // Decipher using Node's vm module as JS evaluator
  try {
    const vm = await import('node:vm')
    const url = await best.decipher(yt.session.player, {
      eval: (js: string) => vm.runInNewContext(js),
    })
    console.log('decipher OK, expire:', new URL(url).searchParams.get('expire'))
    console.log('url snippet:', url.slice(0, 80) + '...')
  } catch (e: any) {
    console.log('decipher error:', e.message.slice(0, 120))
  }

  // ── Artist ────────────────────────────────────────────────────────────────
  console.log('\n=== ARTIST PAGE ===')
  const artistId = firstSong?.artists?.[0]?.channel_id ?? 'UCHawCX0CQ3HopRIJgNQjVZg'
  const artistPage = await yt.music.getArtist(artistId)
  console.log('artist name:', (artistPage as any)?.header?.title?.text)
  console.log('sections:', (artistPage as any)?.sections?.length)
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
