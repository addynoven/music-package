/**
 * Quickstart — the minimum viable usage of MusicKit.
 * Copy this to get up and running in under a minute.
 */

import { MusicKit } from 'musicstream-sdk'

const mk = new MusicKit()

async function main() {
  // Autocomplete — returns suggestions as you type
  const suggestions = await mk.autocomplete("never gonna")
  console.log(suggestions)
  // → ["never gonna give you up", "never gonna let you down", ...]

  // Search — returns typed results
  const results = await mk.search("never gonna give you up")
  const top = results.songs[0]
  console.log(`${top.title} by ${top.artist}`)
  // → "Never Gonna Give You Up by Rick Astley"

  // Get a playable stream URL from the top result
  const stream = await mk.getStream(top.videoId)
  console.log(stream.url)    // → "https://rr5---.googlevideo.com/videoplayback?..."
  console.log(stream.codec)  // → "opus"
}

main()
