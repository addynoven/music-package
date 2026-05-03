// Local types — will be unified with src/analysis/types.ts post-merge.
type Tonic = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'
type Mode = 'major' | 'minor'
type CamelotCode = `${1|2|3|4|5|6|7|8|9|10|11|12}${'A'|'B'}`

const CAMELOT_MAJOR: Record<Tonic, CamelotCode> = {
  'C':  '8B',
  'G':  '9B',
  'D':  '10B',
  'A':  '11B',
  'E':  '12B',
  'B':  '1B',
  'F#': '2B',
  'C#': '3B',
  'G#': '4B',
  'D#': '5B',
  'A#': '6B',
  'F':  '7B',
}

const CAMELOT_MINOR: Record<Tonic, CamelotCode> = {
  'A':  '8A',
  'E':  '9A',
  'B':  '10A',
  'F#': '11A',
  'C#': '12A',
  'G#': '1A',
  'D#': '2A',
  'A#': '3A',
  'F':  '4A',
  'C':  '5A',
  'G':  '6A',
  'D':  '7A',
}

export function keyToCamelot(tonic: Tonic, mode: Mode): CamelotCode {
  return mode === 'major' ? CAMELOT_MAJOR[tonic] : CAMELOT_MINOR[tonic]
}

export type { Tonic, Mode, CamelotCode }
