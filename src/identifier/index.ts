import { spawn } from 'node:child_process'
import { readFile, unlink } from 'node:fs/promises'
import { NetworkError } from '../errors'

const ACOUSTID_ENDPOINT = 'https://api.acoustid.org/v2/lookup'

export interface IdentifyResult {
  artist: string
  title: string
  score: number
}

interface IdentifierOptions {
  acoustidApiKey: string
  songrecBin?: string
}

export class Identifier {
  constructor(private readonly options: IdentifierOptions) {}

  async lookup(fingerprint: string, duration: number): Promise<IdentifyResult | null> {
    const params = new URLSearchParams({
      client: this.options.acoustidApiKey,
      meta: 'recordings+compress',
      duration: String(Math.round(duration)),
      fingerprint,
    })

    const response = await fetch(`${ACOUSTID_ENDPOINT}?${params}`)
    if (!response.ok) throw new NetworkError(`AcoustID API error: ${response.status}`, response.status)

    const data = await response.json() as any
    if (data.status !== 'ok' || !data.results?.length) return null

    const best = [...data.results]
      .filter((r: any) => r.recordings?.length)
      .sort((a: any, b: any) => b.score - a.score)[0]

    if (!best) return null

    const recording = best.recordings[0]
    const artist = recording.artists?.[0]?.name ?? ''
    const title = recording.title ?? ''
    if (!artist || !title) return null

    return { artist, title, score: best.score }
  }

  async fingerprint(filePath: string): Promise<{ fingerprint: string; duration: number }> {
    const pcmBuffer = await this.decodeToPCM(filePath)
    const sampleRate = 44100
    const channels = 1
    const duration = Math.floor(pcmBuffer.length / (4 * channels)) / sampleRate

    const fakeAudioBuffer = this.buildFakeAudioBuffer(pcmBuffer, sampleRate, channels)

    const savedWindow = (global as any).window
    ;(global as any).window = {
      AudioContext: class {
        decodeAudioData() { return Promise.resolve(fakeAudioBuffer) }
      },
    }

    try {
      const { processAudioFile } = await import('@unimusic/chromaprint')
      const fileBytes = await readFile(filePath)
      const gen = processAudioFile(fileBytes.buffer as ArrayBuffer)
      const { value } = await gen.next()
      if (!value) throw new Error('Chromaprint returned no fingerprint')
      return { fingerprint: value, duration }
    } finally {
      if (savedWindow !== undefined) {
        ;(global as any).window = savedWindow
      } else {
        delete (global as any).window
      }
    }
  }

  async recognizeWithSongrec(filePath: string): Promise<IdentifyResult | null> {
    if (!this.options.songrecBin) return null

    const clipPath = `/tmp/songrec-clip-${Date.now()}.wav`
    await this.extractClip(filePath, clipPath)

    let output: string
    try {
      output = await new Promise<string>((resolve, reject) => {
        const proc = spawn(this.options.songrecBin!, ['audio-file-to-recognized-song', clipPath])
        const chunks: Buffer[] = []
        proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
        proc.stderr.resume()
        proc.on('error', (err) => reject(new Error(`songrec spawn failed: ${err.message}`)))
        proc.on('close', (code) => {
          if (code !== 0) resolve('')
          else resolve(Buffer.concat(chunks).toString('utf8').trim())
        })
      })
    } finally {
      unlink(clipPath).catch(() => {})
    }

    if (!output) return null

    try {
      const data = JSON.parse(output) as any
      const track = data?.track
      if (!track?.title || !track?.subtitle) return null
      return { artist: track.subtitle as string, title: track.title as string, score: 1 }
    } catch {
      return null
    }
  }

  private extractClip(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-ss', '60',
        '-t', '10',
        '-i', inputPath,
        '-ar', '44100', '-ac', '1',
        '-f', 'wav',
        '-y', outputPath,
      ])
      proc.stderr.resume()
      proc.on('error', (err) => reject(new Error(`ffmpeg clip failed: ${err.message}`)))
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`ffmpeg clip exited ${code}`))
        else resolve()
      })
    })
  }

  private decodeToPCM(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-i', filePath,
        '-ar', '44100',
        '-ac', '1',
        '-f', 'f32le',
        'pipe:1',
      ])
      const chunks: Buffer[] = []
      ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      ffmpeg.stderr.resume()
      ffmpeg.on('error', (err) => reject(new Error(`ffmpeg not found: ${err.message}`)))
      ffmpeg.on('close', (code) => {
        if (code !== 0) reject(new Error(`ffmpeg decode failed (exit ${code})`))
        else resolve(Buffer.concat(chunks))
      })
    })
  }

  private buildFakeAudioBuffer(pcmBuffer: Buffer, sampleRate: number, channels: number) {
    const length = Math.floor(pcmBuffer.length / (4 * channels))
    return {
      sampleRate,
      numberOfChannels: channels,
      length,
      getChannelData: (channel: number): Float32Array => {
        const samples = new Float32Array(length)
        for (let i = 0; i < length; i++) {
          samples[i] = pcmBuffer.readFloatLE((i * channels + channel) * 4)
        }
        return samples
      },
    }
  }
}
