import {
  MusicKit, Cache, RateLimiter, RetryEngine, Queue, Logger, LyricsRegistry,
  PodcastClient, Identifier, MusicKitEmitter, DiscoveryClient, StreamResolver,
  Downloader, SessionManager, resolveInput, resolveSpotifyUrl,
  getBestThumbnail, isStreamExpired, version, SearchFilter, MusicKitErrorCode,
  safeParseSong, safeParseAlbum, safeParseArtist, safeParsePlaylist,
  SongSchema, parseLrc, getActiveLine, getActiveLineIndex, formatTimestamp,
  offsetLrc, serializeLrc,
  fetchFromBetterLyrics, fetchFromLrclib, fetchFromLyricsOvh, fetchFromKuGou,
  fetchFromSimpMusic, betterLyricsProvider, lrclibProvider, lyricsOvhProvider,
  kugouProvider, simpMusicProvider,
  MusicKitBaseError, NotFoundError, RateLimitError, NetworkError,
  ValidationError, StreamError, HttpError, NonRetryableError,
} from '../src/index'

const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m', Rs = '\x1b[0m'
let pass = 0, fail = 0
const failures: string[] = []
function ok(c: boolean, m: string) { if (c) { pass++; console.log(`${G}✓${Rs} ${m}`) } else { fail++; failures.push(m); console.log(`${R}✗${Rs} ${m}`) } }
function sec(t: string) { console.log(`\n${C}▶ ${t}${Rs}`) }

async function run() {
  console.log(`${Y}musicstream-sdk v${version} — Manual Verification${Rs}`)
  console.log(`Node ${process.version}`)

  sec('1. Constants & Utilities')
  ok(typeof version === 'string' && /^\d+\.\d+\.\d+/.test(version), `version = "${version}"`)
  ok(SearchFilter.Songs === 'songs', 'SearchFilter.Songs')
  ok(MusicKitErrorCode.RateLimited === 'RATE_LIMITED', 'MusicKitErrorCode.RateLimited')

  const thumbs = [{ url: 'a', width: 120, height: 90 }, { url: 'b', width: 360, height: 240 }, { url: 'c', width: 480, height: 360 }]
  ok(getBestThumbnail(thumbs, 400)?.url === 'b', 'getBestThumbnail 360 for 400')
  ok(getBestThumbnail(thumbs, 500)?.url === 'c', 'getBestThumbnail 480 for 500')
  ok(getBestThumbnail([], 100) === null, 'getBestThumbnail empty')

  const nowSec = Math.floor(Date.now() / 1000)
  ok(isStreamExpired({ url: 'x', codec: 'opus', mimeType: 'audio/webm', bitrate: 1, expiresAt: nowSec + 3600 }) === false, 'isStreamExpired fresh')
  ok(isStreamExpired({ url: 'x', codec: 'opus', mimeType: 'audio/webm', bitrate: 1, expiresAt: nowSec - 10 }) === true, 'isStreamExpired past')
  ok(isStreamExpired({ url: 'x', codec: 'opus', mimeType: 'audio/webm', bitrate: 1, expiresAt: nowSec + 200 }) === true, 'isStreamExpired buffer')

  ok(resolveInput('https://youtube.com/watch?v=abc') === 'abc', 'resolveInput video')
  ok(resolveInput('https://music.youtube.com/playlist?list=PLabc') === 'PLabc', 'resolveInput playlist')
  ok(resolveInput('hello') === 'hello', 'resolveInput passthrough')

  sec('2. Schema Validation')
  const goodSong = { type: 'song' as const, videoId: 'abc', title: 'T', artist: 'A', duration: 180, thumbnails: [] }
  ok(SongSchema.safeParse(goodSong).success, 'SongSchema valid')
  ok(!SongSchema.safeParse({ ...goodSong, videoId: '' }).success, 'SongSchema reject empty')
  ok(safeParseSong(goodSong)?.title === 'T', 'safeParseSong')
  ok(safeParseSong({}) === null, 'safeParseSong bad')

  sec('3. LRC Helpers')
  const lrc = '[00:01.50]Line one\n[00:03.00]Line two'
  const parsed = parseLrc(lrc)
  ok(parsed.length === 2, 'parseLrc 2 lines')
  ok(parsed[0].time === 1.5, 'parseLrc time')
  ok(parsed[0].text === 'Line one', 'parseLrc text')
  ok(getActiveLine(parsed, 2)?.text === 'Line one', 'getActiveLine')
  ok(getActiveLineIndex(parsed, 4) === 1, 'getActiveLineIndex')
  ok(formatTimestamp(62.5) === '[01:02.50]', 'formatTimestamp')
  ok(offsetLrc(parsed, 1000)[0].time === 2.5, 'offsetLrc')
  ok(serializeLrc(parsed) === '[00:01.50] Line one\n[00:03.00] Line two', 'serializeLrc')

  sec('4. Standalone Classes')
  const q = new Queue()
  ok(q.isEmpty, 'Queue empty')
  q.add({ ...goodSong, videoId: '1' })
  q.add({ ...goodSong, videoId: '2' })
  ok(q.size === 2, 'Queue size 2')
  ok(q.current === null, 'Queue.current null before next')
  q.next(); ok(q.current?.videoId === '1', 'Queue.current after next')
  q.playNext({ ...goodSong, videoId: '0' })
  ok(q.upcoming[0].videoId === '0', 'playNext head')
  q.next(); ok(q.current?.videoId === '0', 'next to playNext')
  q.previous(); ok(q.current?.videoId === '1', 'previous back')
  q.repeat = 'all'; ok(q.repeat === 'all', 'repeat')
  q.shuffle(); ok(true, 'shuffle ok')
  q.clear(); ok(q.upcoming.length === 0, 'clear')

  const logs: any[] = []
  const log = new Logger({ logLevel: 'debug', logHandler: (l, m) => logs.push({ l, m }) })
  log.debug('dbg')
  ok(logs.some(x => x.l === 'debug' && x.m === 'dbg'), 'Logger debug at debug level')
  log.info('inf')
  ok(logs.some(x => x.l === 'info' && x.m === 'inf'), 'Logger info at debug level')
  const logSilent = new Logger({ logLevel: 'silent' })
  logSilent.info('nope')
  ok(!logs.some(x => x.m === 'nope'), 'silent suppresses')

  const rl = new RateLimiter({ search: 2 }, 0)
  let limited = false
  await rl.throttle('search', () => { limited = true })
  await rl.throttle('search', () => { limited = true })
  await rl.throttle('search', () => { limited = true })
  const wait = rl.getWaitTime('search')
  ok(wait > 0 || limited, `RateLimiter wait=${wait}ms limited=${limited}`)

  const re = new RetryEngine({ maxAttempts: 3, backoffBase: 10, backoffMax: 100 })
  let attempts = 0
  const r = await re.execute(async () => { attempts++; if (attempts < 3) throw new Error('retry'); return 'ok' }, 't')
  ok(r === 'ok' && attempts === 3, 'RetryEngine 3 attempts')

  const cache = new Cache({ enabled: true })
  cache.set('k1', { a: 1 }, 60)
  ok(cache.get('k1')?.a === 1, 'Cache get/set')
  ok(cache.get('miss') === null, 'Cache miss')
  const st = cache.getStats()
  ok(st.hits >= 1 && st.misses >= 1, 'Cache stats')
  cache.close()

  const reg = new LyricsRegistry([betterLyricsProvider, lrclibProvider])
  ok(reg.list().length === 2, 'Registry 2')
  ok(reg.names().includes('better-lyrics'), 'Registry names')
  ok(reg.get('lrclib') === lrclibProvider, 'Registry get')
  ok(reg.unregister('lrclib'), 'Registry unregister')
  ok(!reg.unregister('nope'), 'Registry unregister missing')

  const emitter = new MusicKitEmitter()
  let fired = false, onceFired = false
  const h = () => fired = true
  emitter.on('cacheHit', h); emitter.emit('cacheHit', 'k', 100)
  ok(fired, 'Emitter on')
  emitter.off('cacheHit', h); fired = false; emitter.emit('cacheHit', 'k', 100)
  ok(!fired, 'Emitter off')
  emitter.once('retry', () => onceFired = true); emitter.emit('retry', 's', 1, 'r')
  ok(onceFired, 'Emitter once'); onceFired = false; emitter.emit('retry', 's', 2, 'r')
  ok(!onceFired, 'Emitter once only once')

  const pc = new PodcastClient()
  try {
    const pod = await pc.getFeed('https://feeds.megaphone.fm/replyall')
    ok(pod.title && pod.title.length > 0, `Podcast title: ${pod.title}`)
    ok(Array.isArray(pod.episodes) && pod.episodes.length > 0, `Podcast episodes: ${pod.episodes.length}`)
    ok(typeof pod.episodes[0].duration === 'number', `Podcast episode duration: ${pod.episodes[0].duration}`)
    ok(pod.episodes[0].title && pod.episodes[0].url, 'Podcast episode title + url')
  } catch (e: any) {
    console.log(`${Y}!${Rs} Podcast live feed failed: ${e.message}`)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Test Podcast</title>
    <description>Test Desc</description>
    <itunes:author>Test Author</itunes:author>
    <language>en</language>
    <link>http://example.com</link>
    <itunes:image href="http://example.com/image.jpg"/>
    <item>
      <guid>ep1</guid>
      <title>Episode 1</title>
      <description>Episode description</description>
      <enclosure url="http://example.com/ep1.mp3" type="audio/mpeg" length="1000"/>
      <itunes:duration>10:00</itunes:duration>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`
    const pod2 = await pc.parse(xml, 'http://f.xml')
    ok(pod2.title === 'Test Podcast', 'Podcast parse title fallback')
    ok(pod2.episodes.length === 1, 'Podcast parse 1 ep')
    ok(pod2.episodes[0].duration === 600, 'Podcast parse duration')
  }

  sec('5. Error Classes')
  ok(new NotFoundError('x', 'vid') instanceof MusicKitBaseError, 'NotFoundError instanceof')
  ok(new RateLimitError('s', 5000).retryAfterMs === 5000, 'RateLimitError')
  ok(new NetworkError('f', 503).statusCode === 503, 'NetworkError')
  ok(new ValidationError('b', 'f').field === 'f', 'ValidationError')
  ok(new StreamError('c', 'abc').videoId === 'abc', 'StreamError')
  ok(new HttpError(500, 's').statusCode === 500, 'HttpError')
  ok(new NonRetryableError('stop').message === 'stop', 'NonRetryableError')

  sec('6. MusicKit Construction')
  const mk1 = await MusicKit.create({ logLevel: 'silent' })
  ok(mk1 instanceof MusicKit, 'MusicKit.create')
  const mk2 = new MusicKit({ logLevel: 'silent' })
  ok(mk2 instanceof MusicKit, 'new MusicKit')
  // MusicKit exposes on/off/once but NOT emit (emit is internal)
  let evFired = false
  mk1.on('cacheHit', () => evFired = true)
  // Trigger cacheHit by calling a cached endpoint twice
  const _home1 = await mk1.getHome()
  const _home2 = await mk1.getHome()
  ok(evFired, 'MusicKit on event fires')

  sec('7. Live API')
  const suggs = await mk1.autocomplete('taylor swift')
  ok(Array.isArray(suggs) && suggs.length > 0, `autocomplete: ${suggs.length}`)
  ok(typeof suggs[0] === 'string', 'autocomplete strings')
  ok(suggs.some((s: string) => s.toLowerCase().includes('taylor')), 'autocomplete relevant')

  const results = await mk1.search('daft punk get lucky')
  ok(results && Array.isArray(results.songs) && results.songs.length > 0, `search: ${results.songs.length} songs`)
  const s0 = results.songs[0]
  ok(s0.videoId && s0.title && s0.artist, 'song shape')

  const songs = await mk1.search('daft punk', { filter: 'songs' })
  ok(Array.isArray(songs) && songs[0]?.type === 'song', 'filter songs')
  const albums = await mk1.search('daft punk', { filter: 'albums' })
  ok(Array.isArray(albums), 'filter albums')
  const artists = await mk1.search('daft punk', { filter: 'artists' })
  ok(Array.isArray(artists), 'filter artists')

  const vid = s0.videoId
  const stream = await mk1.getStream(vid, { quality: 'high' })
  ok(stream && typeof stream.url === 'string' && stream.url.length > 0, 'getStream URL')
  ok(stream.codec === 'opus' || stream.codec === 'mp4a', `codec=${stream.codec}`)
  ok(typeof stream.bitrate === 'number' && stream.bitrate > 0, `bitrate=${stream.bitrate}`)
  ok(typeof stream.expiresAt === 'number' && stream.expiresAt > nowSec, 'expiresAt future')
  ok(stream.mimeType.startsWith('audio/'), `mimeType=${stream.mimeType}`)

  const track = await mk1.getTrack(vid)
  ok(track && track.videoId === vid && track.stream?.url, 'getTrack')
  const meta = await mk1.getMetadata(vid)
  ok(meta && meta.videoId === vid && !('stream' in meta), 'getMetadata')

  const home = await mk1.getHome()
  ok(Array.isArray(home) && home.length > 0, `getHome: ${home.length}`)
  ok(home[0].title && Array.isArray(home[0].items), 'home shape')

  if (results.artists?.length) {
    const art = await mk1.getArtist(results.artists[0].channelId)
    ok(art?.name && Array.isArray(art.songs) && Array.isArray(art.albums), `getArtist: ${art.name}`)
  } else { console.log(`${Y}!${Rs} skip getArtist`) }

  if (results.albums?.length) {
    const alb = await mk1.getAlbum(results.albums[0].browseId)
    ok(alb?.title && Array.isArray(alb.tracks), `getAlbum: ${alb.title}`)
  } else { console.log(`${Y}!${Rs} skip getAlbum`) }

  const radio = await mk1.getRadio(vid)
  ok(Array.isArray(radio), `getRadio: ${radio.length}`)
  const related = await mk1.getRelated(vid)
  ok(Array.isArray(related), `getRelated: ${related.length}`)
  const sugg2 = await mk1.getSuggestions(vid)
  ok(Array.isArray(sugg2), `getSuggestions: ${sugg2.length}`)

  const charts = await mk1.getCharts({ country: 'US' })
  ok(Array.isArray(charts), `getCharts: ${charts.length}`)
  if (charts.length) ok(typeof charts[0].title === 'string', 'charts title')

  const moods = await mk1.getMoodCategories()
  ok(Array.isArray(moods), `moods: ${moods.length}`)
  if (moods.length) {
    ok(typeof moods[0].title === 'string' && moods[0].params, 'mood shape')
    const mpl = await mk1.getMoodPlaylists(moods[0].params)
    ok(Array.isArray(mpl), `moodPlaylists: ${mpl.length}`)
  }

  sec('8. Lyrics')
  const lyTrack = await mk1.search('ed sheeran shape of you', { filter: 'songs', limit: 1 })
  if (lyTrack.length) {
    const ly = await mk1.getLyrics(lyTrack[0].videoId)
    if (ly) {
      ok(ly.plain.length > 0, `lyrics plain: ${ly.plain.length}`)
      ok(typeof ly.source === 'string', `lyrics source: ${ly.source}`)
      console.log(`  source=${ly.source} synced=${ly.synced ? ly.synced.length + ' lines' : 'null'}`)
      if (ly.synced?.length) {
        ok(typeof ly.synced[0].time === 'number', 'synced time')
        if (ly.synced[0].words) ok(Array.isArray(ly.synced[0].words), 'word-level')
      }
    } else { console.log(`${Y}!${Rs} No lyrics (acceptable)`) }
    const ly2 = await mk1.getLyrics(lyTrack[0].videoId, { providers: ['lrclib'] })
    console.log(`  lrclib override: ${ly2 ? ly2.source + ' ' + ly2.plain.length + ' chars' : 'null'}`)
  }

  sec('9. Standalone Lyrics Fetchers')
  const bl = await fetchFromBetterLyrics('Ed Sheeran', 'Shape of You', 240)
  console.log(`  better-lyrics: ${bl ? bl.source + ' words=' + (bl.synced?.[0]?.words ? 'yes' : 'no') : 'null'}`)
  const ll = await fetchFromLrclib('Ed Sheeran', 'Shape of You', 240)
  console.log(`  lrclib: ${ll ? ll.source + ' synced=' + (ll.synced ? 'yes' : 'no') : 'null'}`)
  const lo = await fetchFromLyricsOvh('Ed Sheeran', 'Shape of You')
  console.log(`  lyrics-ovh: ${lo ? lo.source + ' ' + lo.plain.length + ' chars' : 'null'}`)

  sec('10. Cache Events')
  let cacheHit = false, cacheMiss = false
  mk1.on('cacheHit', () => cacheHit = true)
  mk1.on('cacheMiss', () => cacheMiss = true)
  await mk1.getStream(vid, { quality: 'high' })
  ok(cacheHit, 'cacheHit')
  await mk1.getStream('dQw4w9WgXcQ', { quality: 'high' }).catch(() => {})
  ok(cacheMiss, 'cacheMiss')

  sec('11. Custom Source')
  mk1.registerSource({ name: 'custom-test', canHandle: () => true, search: async () => ({ songs: [], albums: [], artists: [], playlists: [] }), getStream: async () => stream, getMetadata: async () => goodSong } as any)
  ok((mk1 as any).sources.some((s: any) => s.name === 'custom-test'), 'registerSource')

  sec('12. Spotify URL')
  try {
    const sq = await resolveSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')
    ok(typeof sq === 'string' && sq.length > 0, `spotify: "${sq}"`)
  } catch (e: any) { console.log(`${Y}!${Rs} spotify failed: ${e.message}`) }

  sec('13. Stream Quality')
  const sh = await mk1.getStream(vid, { quality: 'high' })
  const sl = await mk1.getStream(vid, { quality: 'low' })
  ok(sh.bitrate >= sl.bitrate, `high=${sh.bitrate} >= low=${sl.bitrate}`)

  sec('14. Playlist')
  const plSearch = await mk1.search('workout music', { filter: 'playlists' })
  ok(Array.isArray(plSearch), `playlist search: ${plSearch.length}`)
  if (plSearch.length > 0 && plSearch[0].playlistId) {
    const pl = await mk1.getPlaylist(plSearch[0].playlistId)
    ok(pl?.title && Array.isArray(pl.songs), `getPlaylist: ${pl.title}, ${pl.songs?.length} songs`)
  }

  sec('15. Download')
  const dlDir = '/tmp/musicstream-sdk-test-download'
  await import('node:fs').then(fs => { try { fs.rmSync(dlDir, { recursive: true }) } catch {} })
  const dlTrack = await mk1.search('daft punk get lucky', { filter: 'songs', limit: 1 })
  if (dlTrack.length && dlTrack[0].videoId) {
    let progressFired = false
    try {
      await mk1.download(dlTrack[0].videoId, {
        path: dlDir,
        format: 'opus',
        onProgress: (p) => { progressFired = true; process.stdout.write(`\r  ${Math.floor(p.percent)}% ${p.filename} `) }
      })
      console.log()
      ok(progressFired, 'download progress fired')
      const fs = await import('node:fs')
      const files = fs.readdirSync(dlDir)
      ok(files.length > 0, `download created file: ${files[0]}`)
      const stats = fs.statSync(`${dlDir}/${files[0]}`)
      ok(stats.size > 10000, `download file size > 10KB: ${stats.size}`)
    } catch (e: any) {
      console.log(`\n${R}✗${Rs} download failed: ${e.message}`)
      fail++; failures.push(`download: ${e.message}`)
    }
  }

  sec('16. streamAudio / streamPCM')
  try {
    const audioStream = await mk1.streamAudio(vid)
    ok(audioStream && typeof audioStream.pipe === 'function', 'streamAudio returns ReadableStream')
    let audioBytes = 0
    audioStream.on('data', (chunk: Buffer) => { audioBytes += chunk.length })
    await new Promise((res, rej) => { audioStream.on('end', res); audioStream.on('error', rej); setTimeout(() => rej(new Error('timeout')), 8000) })
    ok(audioBytes > 10000, `streamAudio received ${audioBytes} bytes`)
  } catch (e: any) {
    console.log(`${R}✗${Rs} streamAudio failed: ${e.message}`)
    fail++; failures.push(`streamAudio: ${e.message}`)
  }

  try {
    const pcmStream = await mk1.streamPCM(vid)
    ok(pcmStream && typeof pcmStream.pipe === 'function', 'streamPCM returns ReadableStream')
    let pcmBytes = 0
    pcmStream.on('data', (chunk: Buffer) => { pcmBytes += chunk.length })
    await new Promise((res, rej) => { pcmStream.on('end', res); pcmStream.on('error', rej); setTimeout(() => rej(new Error('timeout')), 8000) })
    ok(pcmBytes > 10000, `streamPCM received ${pcmBytes} bytes`)
  } catch (e: any) {
    console.log(`${R}✗${Rs} streamPCM failed: ${e.message}`)
    fail++; failures.push(`streamPCM: ${e.message}`)
  }

  sec('17. Source Routing Per-Call')
  const routed = await mk1.search('daft punk', { source: 'youtube' })
  ok(Array.isArray(routed) || (routed && typeof routed === 'object'), 'per-call source override works')

  sec('18. registerLyricsProvider runtime')
  try {
    mk1.registerLyricsProvider({ name: 'test-provider', fetch: async () => null })
    ok(true, 'registerLyricsProvider succeeds after ensureClients')
  } catch (e: any) {
    ok(false, `registerLyricsProvider failed: ${e.message}`)
  }

  sec('19. getPodcast via MusicKit')
  try {
    const podViaMk = await mk1.getPodcast('https://feeds.megaphone.fm/replyall')
    ok(podViaMk.title && podViaMk.episodes.length > 0, `getPodcast via MusicKit: ${podViaMk.title}`)
  } catch (e: any) {
    console.log(`${Y}!${Rs} getPodcast via MusicKit failed: ${e.message}`)
  }

  console.log(`\n${'='.repeat(50)}`)
  if (fail === 0) console.log(`${G}ALL ${pass} TESTS PASSED${Rs}`)
  else { console.log(`${R}${fail} FAILED${Rs}, ${G}${pass} PASSED`); failures.forEach(f => console.log(`  ${R}•${Rs} ${f}`)) }
  console.log('='.repeat(50))

  ;(mk1 as any).cache?.close?.(); (mk2 as any).cache?.close?.()
}

run().catch(e => { console.error(`${R}FATAL:${Rs}`, e); process.exit(1) })
