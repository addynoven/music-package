import { MusicKit } from '../src/index.ts'

async function main() {
  const mk = await MusicKit.create({ cache: { enabled: false } })

  for (const [label, id] of [
    ['Rap God (YouTube)', 'XbGs_qK2PQA'],
    ['Tum Hi Ho (JioSaavn)', 'jio:gQ2VJt2n'],
  ]) {
    console.log(`\n── ${label}`)
    const lyrics = await mk.getLyrics(id as string)
    if (!lyrics) { console.log('null'); continue }
    console.log(`plain (${lyrics.plain.length} chars): ${lyrics.plain.slice(0, 80)}...`)
    if (lyrics.synced) {
      console.log(`synced (${lyrics.synced.length} lines): first 3 →`, lyrics.synced.slice(0, 3))
    } else {
      console.log('synced: null')
    }
  }
}

main().catch(console.error)
