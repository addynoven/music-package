import { z } from 'zod'
import type { Analysis } from './types'

// ─── Camelot ──────────────────────────────────────────────────────────────────

const CAMELOT_VALUES = [
  '1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A',
  '1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '10B', '11B', '12B',
] as const

export const CamelotSchema = z.enum(CAMELOT_VALUES)

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

export const TempoSchema = z.object({
  bpm: z.number().positive(),
  confidence: z.number().min(0).max(1),
  beatGrid: z.array(z.number().nonnegative()),
})

export const OnsetsSchema = z.array(z.number())

export const KeySchema = z.object({
  tonic: z.enum(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']),
  mode: z.enum(['major', 'minor']),
  camelot: CamelotSchema,
  confidence: z.number().min(0).max(1),
})

export const EnergyPointSchema = z.object({
  t: z.number(),
  rms: z.number(),
})

export const EnergySchema = z.object({
  overall: z.number(),
  envelope: z.array(EnergyPointSchema).optional(),
})

export const AnalysisSectionSchema = z.object({
  start: z.number(),
  end: z.number(),
  label: z.string(),
  loudness: z.number(),
})

// ─── AnalysisSchema ───────────────────────────────────────────────────────────

export const AnalysisSchema = z.object({
  videoId: z.string().min(1),
  duration: z.number().positive(),
  tempo: TempoSchema,
  onsets: OnsetsSchema,
  key: KeySchema.nullable(),
  energy: EnergySchema.nullable(),
  sections: z.array(AnalysisSectionSchema).nullable(),
  analyzedAt: z.string().min(1),
})

// ─── safeParseAnalysis ────────────────────────────────────────────────────────

export function safeParseAnalysis(input: unknown): Analysis | null {
  const result = AnalysisSchema.safeParse(input)
  return result.success ? (result.data as Analysis) : null
}
