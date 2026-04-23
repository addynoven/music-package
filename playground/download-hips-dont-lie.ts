import { MusicKit } from '../src/musickit'

async function main() {
  const mk = await MusicKit.create({ cache: { enabled: false } })

  // Force YouTube search so we get a downloadable ID directly
  console.log('Searching YouTube for Runaway by Aurora...')
  const results = await mk.search('Aurora Runaway', { filter: 'songs', source: 'youtube' } as any) as any[]
  const song = results[0]
  console.log(`Found: ${song.title} — ${song.artist} (${song.videoId})`)

  if (song.videoId.startsWith('jio:')) {
    throw new Error('Got a jio: ID — source:youtube option did not work')
  }

  console.log('\nDownloading to ~/Music/ (opus)...')
  await mk.download(song.videoId, {
    path: `${process.env.HOME}/Music`,
    format: 'opus',
    onProgress: (pct) => process.stdout.write(`\r  ${pct.toFixed(1)}%   `),
  })

  console.log('\n\nDone!')
}

main().catch(console.error)
