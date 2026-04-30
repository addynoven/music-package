import { describe, it, expect } from 'vitest'
import {
  headersForClient,
  parseClientFromUrl,
  headersForUrl,
  type ClientId,
  type ClientHeaders,
} from '../../../src/stream/client-headers.js'

// ─── Canonical UA strings (mirrored from implementation for assertion) ─────────

const UA_WEB =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
const UA_ANDROID =
  'com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip'
const UA_ANDROID_VR =
  'com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Oculus Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)'
const UA_ANDROID_CREATOR =
  'com.google.android.apps.youtube.creator/25.03.101 (Linux; U; Android 15; en_US; Pixel 9 Pro Fold; Build/AP3A.241005.015.A2; Cronet/132.0.6779.0)'
const UA_IOS =
  'com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)'
const UA_IPADOS =
  'com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)'
const UA_TVHTML5 =
  'Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15'
const UA_TVHTML5_SIMPLY_EMBEDDED =
  'Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15'
const UA_DEFAULT_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ─── headersForClient — canonical UA per known ClientId ───────────────────────

describe('headersForClient — canonical User-Agent per ClientId', () => {
  const cases: Array<[ClientId, string]> = [
    ['WEB', UA_WEB],
    ['WEB_REMIX', UA_WEB],
    ['WEB_EMBEDDED_PLAYER', UA_WEB],
    ['WEB_CREATOR', UA_WEB],
    ['ANDROID', UA_ANDROID],
    ['ANDROID_MUSIC', UA_ANDROID],
    ['ANDROID_VR', UA_ANDROID_VR],
    ['ANDROID_CREATOR', UA_ANDROID_CREATOR],
    ['ANDROID_TESTSUITE', UA_ANDROID],
    ['IOS', UA_IOS],
    ['IOS_MUSIC', UA_IOS],
    ['IPADOS', UA_IPADOS],
    ['TVHTML5', UA_TVHTML5],
    ['TVHTML5_SIMPLY_EMBEDDED_PLAYER', UA_TVHTML5_SIMPLY_EMBEDDED],
  ]

  for (const [clientId, expectedUA] of cases) {
    it(`${clientId} → correct User-Agent`, () => {
      expect(headersForClient(clientId)['User-Agent']).toBe(expectedUA)
    })
  }
})

// ─── headersForClient — Origin and Referer correctness ───────────────────────

describe('headersForClient — Origin and Referer', () => {
  // WEB_REMIX must use music.youtube.com
  describe('WEB_REMIX', () => {
    it('has Origin: music.youtube.com', () => {
      expect(headersForClient('WEB_REMIX').Origin).toBe('https://music.youtube.com')
    })

    it('has Referer: https://music.youtube.com/', () => {
      expect(headersForClient('WEB_REMIX').Referer).toBe('https://music.youtube.com/')
    })
  })

  // WEB uses www.youtube.com
  describe('WEB', () => {
    it('has Origin: https://www.youtube.com', () => {
      expect(headersForClient('WEB').Origin).toBe('https://www.youtube.com')
    })

    it('has Referer: https://www.youtube.com/', () => {
      expect(headersForClient('WEB').Referer).toBe('https://www.youtube.com/')
    })
  })

  // WEB_EMBEDDED_PLAYER uses www.youtube.com
  describe('WEB_EMBEDDED_PLAYER', () => {
    it('has Origin: https://www.youtube.com', () => {
      expect(headersForClient('WEB_EMBEDDED_PLAYER').Origin).toBe('https://www.youtube.com')
    })
  })

  // WEB_CREATOR uses www.youtube.com
  describe('WEB_CREATOR', () => {
    it('has Origin: https://www.youtube.com', () => {
      expect(headersForClient('WEB_CREATOR').Origin).toBe('https://www.youtube.com')
    })
  })

  // TVHTML5 has youtube.com with /tv referer
  describe('TVHTML5', () => {
    it('has Origin: https://www.youtube.com', () => {
      expect(headersForClient('TVHTML5').Origin).toBe('https://www.youtube.com')
    })

    it('has Referer pointing to youtube.com/tv', () => {
      expect(headersForClient('TVHTML5').Referer).toBe('https://www.youtube.com/tv')
    })
  })

  // TVHTML5_SIMPLY_EMBEDDED_PLAYER also uses youtube.com/tv
  describe('TVHTML5_SIMPLY_EMBEDDED_PLAYER', () => {
    it('has Origin: https://www.youtube.com', () => {
      expect(headersForClient('TVHTML5_SIMPLY_EMBEDDED_PLAYER').Origin).toBe(
        'https://www.youtube.com',
      )
    })

    it('has Referer pointing to youtube.com/tv', () => {
      expect(headersForClient('TVHTML5_SIMPLY_EMBEDDED_PLAYER').Referer).toBe(
        'https://www.youtube.com/tv',
      )
    })
  })

  // Mobile/native clients must NOT have Origin or Referer
  describe('mobile and native clients — no Origin/Referer', () => {
    const mobileClients: ClientId[] = [
      'ANDROID',
      'ANDROID_MUSIC',
      'ANDROID_VR',
      'ANDROID_CREATOR',
      'ANDROID_TESTSUITE',
      'IOS',
      'IOS_MUSIC',
      'IPADOS',
    ]

    for (const clientId of mobileClients) {
      it(`${clientId} has no Origin`, () => {
        expect(headersForClient(clientId).Origin).toBeUndefined()
      })

      it(`${clientId} has no Referer`, () => {
        expect(headersForClient(clientId).Referer).toBeUndefined()
      })
    }
  })
})

// ─── headersForClient — ANDROID_VR explicit checks ────────────────────────────

describe('headersForClient — ANDROID_VR', () => {
  let headers: ClientHeaders

  beforeEach(() => {
    headers = headersForClient('ANDROID_VR')
  })

  it('has the correct VR Oculus User-Agent', () => {
    expect(headers['User-Agent']).toBe(UA_ANDROID_VR)
  })

  it('has no Origin', () => {
    expect(headers.Origin).toBeUndefined()
  })

  it('has no Referer', () => {
    expect(headers.Referer).toBeUndefined()
  })
})

// ─── headersForClient — unknown client fallback ───────────────────────────────

describe('headersForClient — unknown client fallback', () => {
  it('returns a Chrome desktop User-Agent for an unknown string', () => {
    expect(headersForClient('TOTALLY_UNKNOWN_CLIENT')['User-Agent']).toBe(UA_DEFAULT_CHROME)
  })

  it('returns no Origin for an unknown client', () => {
    expect(headersForClient('MYSTERY')['Origin']).toBeUndefined()
  })

  it('returns no Referer for an unknown client', () => {
    expect(headersForClient('MYSTERY')['Referer']).toBeUndefined()
  })

  it('handles empty string as unknown', () => {
    expect(headersForClient('')['User-Agent']).toBe(UA_DEFAULT_CHROME)
  })
})

// ─── parseClientFromUrl ───────────────────────────────────────────────────────

describe('parseClientFromUrl', () => {
  it('extracts WEB_REMIX from a realistic googlevideo URL', () => {
    const url =
      'https://rr3---sn-5hne6ns7.googlevideo.com/videoplayback?expire=1714000000&ei=abc&ip=1.2.3.4&id=xyz&itag=251&source=youtube&requiressl=yes&c=WEB_REMIX&clen=4200000'
    expect(parseClientFromUrl(url)).toBe('WEB_REMIX')
  })

  it('extracts WEB from a URL with c=WEB', () => {
    const url = 'https://rr1---sn-foo.googlevideo.com/videoplayback?itag=140&c=WEB&expire=1714000000'
    expect(parseClientFromUrl(url)).toBe('WEB')
  })

  it('extracts ANDROID_VR from a URL with c=ANDROID_VR', () => {
    const url = 'https://rr2---sn-bar.googlevideo.com/videoplayback?c=ANDROID_VR&itag=251'
    expect(parseClientFromUrl(url)).toBe('ANDROID_VR')
  })

  it('extracts TVHTML5 from a URL with c=TVHTML5', () => {
    const url = 'https://rr1---sn-baz.googlevideo.com/videoplayback?itag=140&c=TVHTML5'
    expect(parseClientFromUrl(url)).toBe('TVHTML5')
  })

  it('returns null when c= param is absent', () => {
    const url = 'https://rr1---sn-foo.googlevideo.com/videoplayback?itag=140&expire=1714000000'
    expect(parseClientFromUrl(url)).toBeNull()
  })

  it('returns null for a malformed URL string', () => {
    expect(parseClientFromUrl('not a valid url')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseClientFromUrl('')).toBeNull()
  })

  it('returns null for a URL with only a fragment (no query string)', () => {
    expect(parseClientFromUrl('https://rr1---sn-foo.googlevideo.com/videoplayback#section')).toBeNull()
  })
})

// ─── headersForUrl (end-to-end) ───────────────────────────────────────────────

describe('headersForUrl', () => {
  it('returns WEB_REMIX headers for a URL with c=WEB_REMIX', () => {
    const url =
      'https://rr3---sn-5hne6ns7.googlevideo.com/videoplayback?c=WEB_REMIX&expire=1714000000'
    const headers = headersForUrl(url)
    expect(headers['User-Agent']).toBe(UA_WEB)
    expect(headers.Origin).toBe('https://music.youtube.com')
    expect(headers.Referer).toBe('https://music.youtube.com/')
  })

  it('returns ANDROID_VR headers for a URL with c=ANDROID_VR', () => {
    const url =
      'https://rr2---sn-bar.googlevideo.com/videoplayback?c=ANDROID_VR&itag=251'
    const headers = headersForUrl(url)
    expect(headers['User-Agent']).toBe(UA_ANDROID_VR)
    expect(headers.Origin).toBeUndefined()
    expect(headers.Referer).toBeUndefined()
  })

  it('returns default Chrome UA for a URL missing the c= param', () => {
    const url =
      'https://rr1---sn-foo.googlevideo.com/videoplayback?itag=140&expire=1714000000'
    const headers = headersForUrl(url)
    expect(headers['User-Agent']).toBe(UA_DEFAULT_CHROME)
  })

  it('returns default Chrome UA for a malformed URL', () => {
    const headers = headersForUrl('not-a-url')
    expect(headers['User-Agent']).toBe(UA_DEFAULT_CHROME)
  })

  it('returns default Chrome UA for a URL with an unrecognised c= value', () => {
    const url =
      'https://rr1---sn-foo.googlevideo.com/videoplayback?c=FUTURE_CLIENT_XYZ'
    const headers = headersForUrl(url)
    expect(headers['User-Agent']).toBe(UA_DEFAULT_CHROME)
  })
})
