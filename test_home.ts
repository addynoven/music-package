import { Innertube } from 'youtubei.js'

async function run() {
  const yt = await Innertube.create()
  const res = await yt.music.getHomeFeed()
  console.log(JSON.stringify(res.sections?.[0]?.contents?.[0], null, 2))
}
run().catch(console.error)
