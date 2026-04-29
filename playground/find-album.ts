import { MusicKit } from '../src/index.ts'
async function main() {
  const mk = await MusicKit.create({ cache: { enabled: false }, sourceOrder: ['jiosaavn'] })
  const results = await mk.search('eminem the marshall mathers lp2', { filter: 'albums', limit: 3 })
  console.log(JSON.stringify(results, null, 2))
}
main().catch(console.error)
