// ─── Camelot wheel notation ───────────────────────────────────────────────────

type CamelotNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
export type Camelot = `${CamelotNumber}A` | `${CamelotNumber}B`

// ─── Sub-types ────────────────────────────────────────────────────────────────

export interface Tempo {
  /** The dominant tempo in beats per minute. */
  bpm: number
  /** Certainty of BPM detection, in the range [0, 1]. */
  confidence: number
  /** Beat timestamps in seconds — one entry per detected beat. */
  beatGrid: number[]
}

/** Percussive onset timestamps in seconds. */
export type Onsets = number[]

export interface Key {
  /** Root pitch class using sharps only ('C' | 'C#' | … | 'B'). */
  tonic: 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'
  /** Scale mode. */
  mode: 'major' | 'minor'
  /** Camelot Wheel notation, e.g. '8A'. */
  camelot: Camelot
  /** Certainty of key detection, in the range [0, 1]. */
  confidence: number
}

export interface EnergyPoint {
  /** Timestamp in seconds. */
  t: number
  /** Normalised RMS amplitude at this timestamp. */
  rms: number
}

export interface Energy {
  /** Mean RMS amplitude for the whole track, normalised to [0, 1]. */
  overall: number
  /** RMS over time, downsampled to ~2 Hz. Absent when not computed. */
  envelope?: EnergyPoint[]
}

export interface AnalysisSection {
  /** Section start in seconds. */
  start: number
  /** Section end in seconds. */
  end: number
  /** Human-readable segment label, e.g. 'intro', 'verse', 'chorus'. */
  label: string
  /** Normalised loudness for this section. */
  loudness: number
}

// ─── Top-level Analysis ───────────────────────────────────────────────────────

export interface Analysis {
  /** YouTube video ID this analysis is for. */
  videoId: string
  /** Track duration in seconds. */
  duration: number
  /** Tempo / beat-grid data (required — the rhythm-game cannot function without it). */
  tempo: Tempo
  /** Percussive onset timestamps in seconds (required). */
  onsets: Onsets
  /** Key detection result. Null when not computed or computation failed. */
  key: Key | null
  /** Energy envelope. Null when not computed or computation failed. */
  energy: Energy | null
  /** Structural sections. Null when not computed or computation failed. */
  sections: AnalysisSection[] | null
  /** ISO 8601 timestamp of when this analysis was produced. */
  analyzedAt: string
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface AnalysisProvider {
  /** Unique name identifying this provider. */
  name: string
  /**
   * Analyse the given audio buffer and return an `Analysis`.
   *
   * @param videoId  YouTube video ID (used for cache keying and logging).
   * @param audio    Raw audio as a PCM / encoded byte buffer.
   */
  analyze(videoId: string, audio: Uint8Array): Promise<Analysis>
}
