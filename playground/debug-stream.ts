/**
 * Diagnose stream URL 403 issues.
 * Run: pnpm exec tsx playground/debug-stream.ts
 */
import { Innertube } from 'youtubei.js'
import { Platform } from 'youtubei.js/agnostic'

const VIDEO_ID = 'Mnu5-meFyfI'

async function main() {
  const yt = await Innertube.create({ generate_session_locally: true })

  Platform.load({
    ...Platform.shim,
    eval: (data: any, env: any) => {
      const fn = new Function(...Object.keys(env), data.output ?? data)
      return fn(...Object.values(env))
    },
  })

  // ── Method 1: yt.music.getInfo (YTMUSIC client) ───────────────────────────
  console.log('=== Method 1: yt.music.getInfo (YTMUSIC) ===')
  const info1 = await yt.music.getInfo(VIDEO_ID)
  const fmts1 = info1.streaming_data?.adaptive_formats ?? []
  const audio1 = fmts1.filter((f: any) => f.has_audio && !f.has_video)
  console.log('Audio formats:', audio1.length)

  if (audio1.length > 0) {
    const best1 = audio1.sort((a: any, b: any) => b.bitrate - a.bitrate)[0] as any
    console.log('Best: itag=%d mime=%s bitrate=%d', best1.itag, best1.mime_type, best1.bitrate)
    console.log('Has direct url:', !!best1.url)
    console.log('Has sig_cipher:', !!best1.signature_cipher)

    const url1 = await best1.decipher(yt.session.player)
    const u1 = new URL(url1)
    console.log('n param:', u1.searchParams.get('n')?.slice(0, 20) + '...')
    console.log('expire:', u1.searchParams.get('expire'))

    const r1 = await fetch(url1, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    console.log('Fetch status:', r1.status, r1.headers.get('content-type'))
  }

  // ── Method 2: yt.getInfo with ANDROID client ──────────────────────────────
  console.log('\n=== Method 2: yt.getInfo (ANDROID client) ===')
  try {
    const info2 = await (yt as any).getInfo(VIDEO_ID, { client: 'ANDROID' })
    const fmts2 = info2.streaming_data?.adaptive_formats ?? []
    const audio2 = fmts2.filter((f: any) => f.has_audio && !f.has_video)
    console.log('Audio formats:', audio2.length)

    if (audio2.length > 0) {
      const best2 = audio2.sort((a: any, b: any) => b.bitrate - a.bitrate)[0] as any
      console.log('Best: itag=%d mime=%s bitrate=%d', best2.itag, best2.mime_type, best2.bitrate)
      console.log('Has direct url:', !!best2.url)
      console.log('Has sig_cipher:', !!best2.signature_cipher)

      const url2 = await best2.decipher(yt.session.player)
      console.log('URL snippet:', url2.slice(0, 100) + '...')

      const r2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      console.log('Fetch status:', r2.status)
    }
  } catch (e: any) {
    console.log('ANDROID client error:', e.message)
  }

  // ── Method 3: IOS client ──────────────────────────────────────────────────
  console.log('\n=== Method 3: IOS client ===')
  for (const client of ['IOS', 'TV_EMBEDDED', 'WEB_EMBEDDED', 'YTMUSIC_ANDROID'] as const) {
    try {
      const info = await (yt as any).getInfo(VIDEO_ID, { client })
      const fmts = info.streaming_data?.adaptive_formats ?? []
      const audio = fmts.filter((f: any) => f.has_audio && !f.has_video)
      if (audio.length === 0) { console.log(client + ': no audio formats'); continue }
      const best = audio.sort((a: any, b: any) => b.bitrate - a.bitrate)[0] as any
      const url = await best.decipher(yt.session.player)
      const r = await fetch(url)
      console.log(client + ': ' + r.status + ' (itag=' + best.itag + ', direct=' + !!best.url + ')')
    } catch (e: any) {
      console.log(client + ': error - ' + e.message.slice(0, 60))
    }
  }
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
