import { describe, it, expect, vi } from 'vitest'
import { resolveViaInnertube } from '../../../src/stream/innertube-resolver'
import { StreamError } from '../../../src/errors'

// Helpers ---------------------------------------------------------------------

function makeFormat(overrides: Record<string, unknown> = {}) {
  return {
    mime_type: 'audio/webm; codecs=opus',
    bitrate: 160000,
    loudness_db: -7.5,
    content_length: 4_500_000,
    decipher: vi.fn().mockResolvedValue('https://stream.example/?expire=9999999999'),
    ...overrides,
  }
}

function makeInfo({
  videoDetails,
  formatOpus,
  formatMp4a,
  chooseFormatThrowOnOpus = false,
  chooseFormatThrowOnAll = false,
}: {
  videoDetails?: Record<string, unknown> | null
  formatOpus?: ReturnType<typeof makeFormat>
  formatMp4a?: ReturnType<typeof makeFormat>
  chooseFormatThrowOnOpus?: boolean
  chooseFormatThrowOnAll?: boolean
} = {}) {
  return {
    page: [{ videoDetails: videoDetails === null ? null : videoDetails ?? { musicVideoType: 'MUSIC_VIDEO_TYPE_OMV' } }],
    chooseFormat: vi.fn((opts: { format?: string }) => {
      if (chooseFormatThrowOnAll) throw new Error('no formats available')
      if (opts.format === 'opus') {
        if (chooseFormatThrowOnOpus) throw new Error('no opus format')
        return formatOpus ?? makeFormat()
      }
      return formatMp4a ?? makeFormat({ mime_type: 'audio/mp4; codecs="mp4a.40.2"' })
    }),
  }
}

function makeYt(info: ReturnType<typeof makeInfo>, getInfoThrows = false) {
  return {
    music: {
      getInfo: vi.fn(async () => {
        if (getInfoThrows) throw new Error('network down')
        return info
      }),
    },
    session: { player: { id: 'fake-player' } },
  } as any
}

// Tests -----------------------------------------------------------------------

describe('resolveViaInnertube', () => {
  it('public catalog track: isPrivateTrack=false, videoType=OMV, opus chosen', async () => {
    const info = makeInfo({ videoDetails: { musicVideoType: 'MUSIC_VIDEO_TYPE_OMV' } })
    const yt = makeYt(info)

    const result = await resolveViaInnertube(yt, 'dQw4w9WgXcQ')

    expect(result.isPrivateTrack).toBe(false)
    expect(result.videoType).toBe('MUSIC_VIDEO_TYPE_OMV')
    expect(result.clientUsed).toBe('YTMUSIC')
    expect(result.stream.codec).toBe('opus')
    expect(result.stream.url).toMatch(/^https:\/\/stream\.example/)
    expect(result.stream.bitrate).toBe(160000)
    expect(result.stream.loudnessDb).toBe(-7.5)
    expect(result.stream.sizeBytes).toBe(4_500_000)
  })

  it('private track: isPrivateTrack=true', async () => {
    const info = makeInfo({
      videoDetails: { musicVideoType: 'MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK' },
    })
    const yt = makeYt(info)

    const result = await resolveViaInnertube(yt, 'PRIVATE_ID')

    expect(result.isPrivateTrack).toBe(true)
    expect(result.videoType).toBe('MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK')
  })

  it('null/missing videoDetails: videoType=null, isPrivateTrack=false', async () => {
    const info = makeInfo({ videoDetails: null })
    const yt = makeYt(info)

    const result = await resolveViaInnertube(yt, 'XYZ')

    expect(result.videoType).toBeNull()
    expect(result.isPrivateTrack).toBe(false)
  })

  it('chooseFormat throws on opus, succeeds on mp4a fallback', async () => {
    const info = makeInfo({ chooseFormatThrowOnOpus: true })
    const yt = makeYt(info)

    const result = await resolveViaInnertube(yt, 'XYZ')

    expect(result.stream.codec).toBe('mp4a')
    // chooseFormat called twice: opus (threw), then mp4a (succeeded)
    expect(info.chooseFormat).toHaveBeenCalledTimes(2)
  })

  it('chooseFormat throws on both formats: throws StreamError', async () => {
    const info = makeInfo({ chooseFormatThrowOnAll: true })
    const yt = makeYt(info)

    await expect(resolveViaInnertube(yt, 'XYZ')).rejects.toBeInstanceOf(StreamError)
  })

  it('getInfo throws: throws StreamError with InnerTube prefix', async () => {
    const yt = makeYt(makeInfo(), true)

    await expect(resolveViaInnertube(yt, 'XYZ')).rejects.toMatchObject({
      name: 'StreamError',
      message: expect.stringContaining('InnerTube getInfo failed'),
    })
  })

  it('format.decipher throws: throws StreamError', async () => {
    const fmt = makeFormat({ decipher: vi.fn().mockRejectedValue(new Error('cipher broken')) })
    const info = makeInfo({ formatOpus: fmt })
    const yt = makeYt(info)

    await expect(resolveViaInnertube(yt, 'XYZ')).rejects.toMatchObject({
      name: 'StreamError',
      message: expect.stringContaining('decipher failed'),
    })
  })

  it('decipher returns empty string: throws StreamError', async () => {
    const fmt = makeFormat({ decipher: vi.fn().mockResolvedValue('') })
    const info = makeInfo({ formatOpus: fmt })
    const yt = makeYt(info)

    await expect(resolveViaInnertube(yt, 'XYZ')).rejects.toMatchObject({
      name: 'StreamError',
      message: expect.stringContaining('empty url'),
    })
  })

  it('honors options.client in clientUsed', async () => {
    const info = makeInfo()
    const yt = makeYt(info)

    const result = await resolveViaInnertube(yt, 'XYZ', { client: 'ANDROID_VR' })

    expect(result.clientUsed).toBe('ANDROID_VR')
  })

  it('options.quality=low maps to chooseFormat quality=medium', async () => {
    const info = makeInfo()
    const yt = makeYt(info)

    await resolveViaInnertube(yt, 'XYZ', { quality: 'low' })

    expect(info.chooseFormat).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 'medium' }),
    )
  })

  it('default quality maps to chooseFormat quality=best', async () => {
    const info = makeInfo()
    const yt = makeYt(info)

    await resolveViaInnertube(yt, 'XYZ')

    expect(info.chooseFormat).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 'best' }),
    )
  })

  it('mp4a fallback returns codec=mp4a in StreamingData', async () => {
    const info = makeInfo({
      chooseFormatThrowOnOpus: true,
      formatMp4a: makeFormat({ mime_type: 'audio/mp4; codecs="mp4a.40.2"' }),
    })
    const yt = makeYt(info)

    const result = await resolveViaInnertube(yt, 'XYZ')

    expect(result.stream.codec).toBe('mp4a')
    expect(result.stream.mimeType).toContain('mp4a')
  })

  it('content_length as numeric string: parsed to sizeBytes number', async () => {
    const fmt = makeFormat({ content_length: '12345678' })
    const info = makeInfo({ formatOpus: fmt })
    const yt = makeYt(info)

    const result = await resolveViaInnertube(yt, 'XYZ')

    expect(result.stream.sizeBytes).toBe(12345678)
  })
})
