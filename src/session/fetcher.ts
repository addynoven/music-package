export async function fetchYouTubeHomePage(): Promise<string> {
  const res = await fetch('https://music.youtube.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MusicKit/1.0)' },
  })
  return res.text()
}
