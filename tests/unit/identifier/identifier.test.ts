import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Identifier } from '../../../src/identifier'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}))

import { spawn, execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'

// ─── AcoustID lookup tests (pure HTTP, no audio needed) ──────────────────────

const MOCK_ACOUSTID_RESPONSE = {
  status: 'ok',
  results: [
    {
      id: 'abc-123',
      score: 0.92,
      recordings: [
        {
          id: 'rec-mbid-1',
          title: 'Bohemian Rhapsody',
          artists: [{ id: 'artist-mbid', name: 'Queen' }],
        },
      ],
    },
  ],
}

describe('Identifier.lookup', () => {
  let identifier: Identifier

  beforeEach(() => {
    identifier = new Identifier({ acoustidApiKey: 'test-key' })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns artist and title on a successful lookup', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_ACOUSTID_RESPONSE,
    } as Response)

    const result = await identifier.lookup('AQADtMmybGkSRZGUS...', 254)
    expect(result).toEqual({ artist: 'Queen', title: 'Bohemian Rhapsody', score: 0.92 })
  })

  it('returns null when AcoustID finds no results', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', results: [] }),
    } as Response)

    expect(await identifier.lookup('fingerprint', 120)).toBeNull()
  })

  it('returns null when results have no recordings', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ok',
        results: [{ id: 'x', score: 0.5, recordings: [] }],
      }),
    } as Response)

    expect(await identifier.lookup('fingerprint', 120)).toBeNull()
  })

  it('returns null when AcoustID status is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'error', error: { message: 'Invalid key' } }),
    } as Response)

    expect(await identifier.lookup('fingerprint', 120)).toBeNull()
  })

  it('throws on a non-ok HTTP response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await expect(identifier.lookup('fingerprint', 120)).rejects.toThrow('AcoustID API error: 500')
  })

  it('picks the highest scoring result when multiple exist', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ok',
        results: [
          {
            id: 'low',
            score: 0.5,
            recordings: [{ id: 'r1', title: 'Wrong Song', artists: [{ name: 'Wrong Artist' }] }],
          },
          {
            id: 'high',
            score: 0.95,
            recordings: [{ id: 'r2', title: 'Right Song', artists: [{ name: 'Right Artist' }] }],
          },
        ],
      }),
    } as Response)

    const result = await identifier.lookup('fingerprint', 180)
    expect(result?.title).toBe('Right Song')
    expect(result?.artist).toBe('Right Artist')
  })

  it('includes the acoustidApiKey as the client param in the request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', results: [] }),
    } as Response)

    await identifier.lookup('fp123', 100)

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('client=test-key')
    expect(calledUrl).toContain('fingerprint=fp123')
    expect(calledUrl).toContain('duration=100')
  })
})

// ─── Identifier.fingerprint (fpcalc) tests ───────────────────────────────────

describe('Identifier.fingerprint', () => {
  let identifier: Identifier

  beforeEach(() => {
    identifier = new Identifier({ acoustidApiKey: 'key' })
    vi.clearAllMocks()
  })

  it('returns fingerprint and duration from fpcalc JSON output', async () => {
    vi.mocked(execFile).mockImplementation((_bin, _args, cb: any) => {
      cb(null, JSON.stringify({ duration: 254.29, fingerprint: 'AQADtMmybGkSRZGU' }), '')
      return {} as any
    })
    const result = await identifier.fingerprint('./song.mp3')
    expect(result).toEqual({ fingerprint: 'AQADtMmybGkSRZGU', duration: 254.29 })
  })

  it('calls fpcalc with -json and the file path', async () => {
    vi.mocked(execFile).mockImplementation((_bin, _args, cb: any) => {
      cb(null, JSON.stringify({ duration: 100, fingerprint: 'abc' }), '')
      return {} as any
    })
    await identifier.fingerprint('./my-song.opus')
    expect(execFile).toHaveBeenCalledWith('fpcalc', ['-json', './my-song.opus'], expect.any(Function))
  })

  it('throws when fpcalc exits with an error', async () => {
    vi.mocked(execFile).mockImplementation((_bin, _args, cb: any) => {
      cb(new Error('fpcalc: command not found'), '', '')
      return {} as any
    })
    await expect(identifier.fingerprint('./song.mp3')).rejects.toThrow('fpcalc failed')
  })
})

// ─── SongRec recognition tests ────────────────────────────────────────────────

function makeSpawnMock(stdout: string, exitCode = 0, stderrOutput = '') {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  const stderrEmitter = new EventEmitter() as any
  stderrEmitter.resume = vi.fn()
  proc.stderr = stderrEmitter

  process.nextTick(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout))
    if (stderrOutput) proc.stderr.emit('data', Buffer.from(stderrOutput))
    proc.emit('close', exitCode)
  })

  return proc
}

const SHAZAM_SUCCESS = JSON.stringify({
  matches: [{ id: 'track:1', offset: 0.3, timeskew: 0.001, frequencyskew: 0.001 }],
  location: { accuracy: 0.01 },
  timestamp: 1700000000000,
  timezone: 'Europe/Paris',
  tagid: 'abc-def-ghi',
  track: {
    layout: '5',
    type: 'MUSIC',
    key: '557116606',
    title: 'Under Pressure',
    subtitle: 'Queen & David Bowie',
    images: { background: 'https://img.jpg', coverart: 'https://cover.jpg', coverarthq: 'https://coverhq.jpg', joecolor: 'b:000000p:ffffffs:fffffft:ee22eeuu:ee22ee' },
    share: { subject: 'Under Pressure - Queen & David Bowie', text: '', href: '', image: '', twitter: '', html: '', snapchat: '' },
    hub: { type: '', image: '', actions: [], explicit: false, displayname: '', options: [] },
    sections: [],
    url: 'https://www.shazam.com/track/557116606/under-pressure',
    artists: [{ id: 'art.1', adamid: '5765418' }],
    alias: 'under-pressure',
    isrc: 'GBF099900224',
    genres: { primary: 'Rock' },
    urlparams: {},
    myshazam: {},
    albumadamid: '12345',
    releasedate: '01-01-1981',
  },
})

// ffmpeg clip mock — always exits 0, no stdout needed
function makeClipMock() {
  return makeSpawnMock('', 0)
}

describe('Identifier.recognizeWithSongrec', () => {
  let identifier: Identifier

  beforeEach(() => {
    identifier = new Identifier({ acoustidApiKey: 'key', songrecBin: 'songrec' })
    vi.clearAllMocks()
  })

  it('returns artist and title from a successful SongRec run', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => makeClipMock() as any)
      .mockImplementationOnce(() => makeSpawnMock(SHAZAM_SUCCESS) as any)
    const result = await (identifier as any).recognizeWithSongrec('./song.mp3')
    expect(result).toEqual({ artist: 'Queen & David Bowie', title: 'Under Pressure', score: 1 })
  })

  it('calls songrec with audio-file-to-recognized-song and a temp wav path', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => makeClipMock() as any)
      .mockImplementationOnce(() => makeSpawnMock(SHAZAM_SUCCESS) as any)
    await (identifier as any).recognizeWithSongrec('./song.mp3')
    const songrec = vi.mocked(spawn).mock.calls[1]
    expect(songrec[0]).toBe('songrec')
    expect(songrec[1][0]).toBe('audio-file-to-recognized-song')
    expect(songrec[1][1]).toMatch(/\.wav$/)
  })

  it('uses custom songrecBin path when provided', async () => {
    identifier = new Identifier({ acoustidApiKey: 'key', songrecBin: '/usr/local/bin/songrec' })
    vi.mocked(spawn)
      .mockImplementationOnce(() => makeClipMock() as any)
      .mockImplementationOnce(() => makeSpawnMock(SHAZAM_SUCCESS) as any)
    await (identifier as any).recognizeWithSongrec('./song.mp3')
    expect(vi.mocked(spawn).mock.calls[1][0]).toBe('/usr/local/bin/songrec')
  })

  it('returns null when SongRec exits with non-zero code', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => makeClipMock() as any)
      .mockImplementationOnce(() => makeSpawnMock('', 1) as any)
    const result = await (identifier as any).recognizeWithSongrec('./song.mp3')
    expect(result).toBeNull()
  })

  it('returns null when Shazam JSON has no track field', async () => {
    const noTrack = JSON.stringify({ matches: [], tagid: 'abc' })
    vi.mocked(spawn)
      .mockImplementationOnce(() => makeClipMock() as any)
      .mockImplementationOnce(() => makeSpawnMock(noTrack) as any)
    const result = await (identifier as any).recognizeWithSongrec('./song.mp3')
    expect(result).toBeNull()
  })

  it('returns null when songrec binary is not configured', async () => {
    identifier = new Identifier({ acoustidApiKey: 'key' })
    const result = await (identifier as any).recognizeWithSongrec('./song.mp3')
    expect(result).toBeNull()
    expect(spawn).not.toHaveBeenCalled()
  })
})
