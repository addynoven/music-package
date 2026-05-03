/**
 * Audio fetch + decode utility for the analysis pipeline.
 *
 * Dependency-injected fetcher keeps this function pure-testable — no real
 * network, no yt-dlp, no streamPCM needed in unit tests.
 *
 * Note on resampling: if sampleRate !== 44_100 Hz we leave it as-is.
 * Resampling is essentia's job (Wave-2 agent I), not ours.
 */

export interface AudioFetcher {
  fetchPCM(videoId: string): Promise<{ samples: Float32Array; sampleRate: number; channels: number }>
}

export interface DecodedAudio {
  /** Mono Float32 PCM samples */
  samples: Float32Array
  /** Hz — passed through from the fetcher unchanged */
  sampleRate: number
  /** Computed as samples.length / sampleRate */
  durationSec: number
}

export async function fetchAudioForAnalysis(
  videoId: string,
  fetcher: AudioFetcher,
): Promise<DecodedAudio> {
  const { samples, sampleRate, channels } = await fetcher.fetchPCM(videoId)

  const mono = channels === 2 ? downmixStereoToMono(samples) : samples

  return {
    samples: mono,
    sampleRate,
    durationSec: mono.length === 0 ? 0 : mono.length / sampleRate,
  }
}

/**
 * Average interleaved stereo samples [L0, R0, L1, R1, ...] into mono.
 */
function downmixStereoToMono(interleaved: Float32Array): Float32Array {
  const frameCount = interleaved.length >>> 1 // fast integer divide-by-2
  const mono = new Float32Array(frameCount)
  for (let i = 0; i < frameCount; i++) {
    mono[i] = (interleaved[i * 2] + interleaved[i * 2 + 1]) * 0.5
  }
  return mono
}
