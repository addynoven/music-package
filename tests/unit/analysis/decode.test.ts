import { describe, it, expect, vi } from 'vitest'
import { fetchAudioForAnalysis } from '../../../src/analysis/decode'
import type { AudioFetcher } from '../../../src/analysis/decode'

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMono(samples: number[], sampleRate = 44_100): AudioFetcher {
  return {
    fetchPCM: vi.fn().mockResolvedValue({
      samples: new Float32Array(samples),
      sampleRate,
      channels: 1,
    }),
  }
}

function makeStereo(left: number[], right: number[], sampleRate = 44_100): AudioFetcher {
  // Interleaved stereo: [L0, R0, L1, R1, ...]
  const interleaved: number[] = []
  for (let i = 0; i < left.length; i++) {
    interleaved.push(left[i], right[i])
  }
  return {
    fetchPCM: vi.fn().mockResolvedValue({
      samples: new Float32Array(interleaved),
      sampleRate,
      channels: 2,
    }),
  }
}

// ─── mono passthrough ─────────────────────────────────────────────────────────

describe('fetchAudioForAnalysis — mono input', () => {
  it('passes mono samples through unchanged', async () => {
    const input = [0.1, 0.2, 0.3, 0.4]
    const fetcher = makeMono(input)

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    // Float32Array has ~7 decimal digits of precision — compare with appropriate tolerance
    expect(result.samples).toHaveLength(input.length)
    for (let i = 0; i < input.length; i++) {
      expect(result.samples[i]).toBeCloseTo(input[i], 5)
    }
  })

  it('preserves sample rate from fetcher', async () => {
    const fetcher = makeMono([0.5], 48_000)

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.sampleRate).toBe(48_000)
  })

  it('calls fetcher with the given videoId', async () => {
    const fetcher = makeMono([0.0])

    await fetchAudioForAnalysis('-tJYN-eG1zk', fetcher)

    expect(fetcher.fetchPCM).toHaveBeenCalledWith('-tJYN-eG1zk')
  })
})

// ─── stereo downmix ───────────────────────────────────────────────────────────

describe('fetchAudioForAnalysis — stereo downmix', () => {
  it('downmixes stereo to mono by averaging L and R', async () => {
    // L=0.5, R=0.5 → average = 0.5
    const fetcher = makeStereo([0.5], [0.5])

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.samples).toHaveLength(1)
    expect(result.samples[0]).toBeCloseTo(0.5, 5)
  })

  it('downmixes L=1.0 R=-1.0 to 0.0', async () => {
    const fetcher = makeStereo([1.0], [-1.0])

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.samples[0]).toBeCloseTo(0.0, 5)
  })

  it('downmixes multiple stereo frames correctly', async () => {
    const fetcher = makeStereo([0.2, 0.8], [0.4, 0.4])
    // frame 0: (0.2 + 0.4) / 2 = 0.3
    // frame 1: (0.8 + 0.4) / 2 = 0.6

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.samples).toHaveLength(2)
    expect(result.samples[0]).toBeCloseTo(0.3, 5)
    expect(result.samples[1]).toBeCloseTo(0.6, 5)
  })

  it('returns mono channel count after downmix', async () => {
    const fetcher = makeStereo([0.0], [0.0])

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    // result is always mono — no channel field on DecodedAudio, but samples.length == frame count
    expect(result.samples).toHaveLength(1)
  })
})

// ─── durationSec computation ──────────────────────────────────────────────────

describe('fetchAudioForAnalysis — durationSec', () => {
  it('computes durationSec from samples / sampleRate', async () => {
    // 44100 samples at 44100 Hz = exactly 1 second
    const fetcher = makeMono(Array(44_100).fill(0.0), 44_100)

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.durationSec).toBeCloseTo(1.0, 5)
  })

  it('computes durationSec correctly for non-standard sample rates', async () => {
    // 48000 samples at 48000 Hz = 1 second
    const fetcher = makeMono(Array(48_000).fill(0.0), 48_000)

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.durationSec).toBeCloseTo(1.0, 5)
  })

  it('durationSec matches samples.length / sampleRate for arbitrary data', async () => {
    const sampleRate = 44_100
    const numSamples = 22_050 // half a second
    const fetcher = makeMono(Array(numSamples).fill(0.0), sampleRate)

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.durationSec).toBeCloseTo(numSamples / sampleRate, 5)
  })

  it('durationSec after stereo downmix uses output sample count / sampleRate', async () => {
    // 2 stereo frames → 2 mono samples; duration = 2 / 44100
    const fetcher = makeStereo([0.1, 0.2], [0.3, 0.4], 44_100)

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.durationSec).toBeCloseTo(2 / 44_100, 8)
  })
})

// ─── empty samples ────────────────────────────────────────────────────────────

describe('fetchAudioForAnalysis — empty samples', () => {
  it('returns empty Float32Array and durationSec 0 when fetcher returns no samples', async () => {
    const fetcher: AudioFetcher = {
      fetchPCM: vi.fn().mockResolvedValue({
        samples: new Float32Array(0),
        sampleRate: 44_100,
        channels: 1,
      }),
    }

    const result = await fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)

    expect(result.samples).toHaveLength(0)
    expect(result.durationSec).toBe(0)
  })
})

// ─── error propagation ────────────────────────────────────────────────────────

describe('fetchAudioForAnalysis — error propagation', () => {
  it('propagates rejection from fetcher', async () => {
    const fetcher: AudioFetcher = {
      fetchPCM: vi.fn().mockRejectedValue(new Error('network failure')),
    }

    await expect(fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)).rejects.toThrow('network failure')
  })

  it('propagates custom error types without wrapping', async () => {
    class AudioUnavailableError extends Error {
      constructor() { super('Audio unavailable'); this.name = 'AudioUnavailableError' }
    }

    const fetcher: AudioFetcher = {
      fetchPCM: vi.fn().mockRejectedValue(new AudioUnavailableError()),
    }

    await expect(fetchAudioForAnalysis('dQw4w9WgXcQ', fetcher)).rejects.toBeInstanceOf(AudioUnavailableError)
  })
})
