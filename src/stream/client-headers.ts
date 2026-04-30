/** Headers expected by YouTube CDN when fetching a stream URL minted by a specific client. */
export interface ClientHeaders {
  'User-Agent': string
  Origin?: string
  Referer?: string
}

/** All client identifier values we recognise from the `c=` URL query param. */
export type ClientId =
  | 'WEB'
  | 'WEB_REMIX'
  | 'WEB_EMBEDDED_PLAYER'
  | 'WEB_CREATOR'
  | 'ANDROID'
  | 'ANDROID_MUSIC'
  | 'ANDROID_VR'
  | 'ANDROID_CREATOR'
  | 'ANDROID_TESTSUITE'
  | 'IOS'
  | 'IOS_MUSIC'
  | 'IPADOS'
  | 'TVHTML5'
  | 'TVHTML5_SIMPLY_EMBEDDED_PLAYER'
  | 'MWEB'

// ─── Canonical UA strings (sourced from YouTubeClient.kt companion object) ────

/**
 * Latest Firefox ESR UA — used by all WEB-family clients.
 * Source: YouTubeClient.kt:50 USER_AGENT_WEB
 */
const UA_WEB =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'

/**
 * Android YouTube mobile app UA.
 * Source: YouTubeClient.kt:117 MOBILE.userAgent
 */
const UA_ANDROID =
  'com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip'

/**
 * Android VR (Oculus) UA — used by ANDROID_VR and as the default fallback in
 * StreamClientUtils.kt:29.
 * Source: YouTubeClient.kt:127 ANDROID_VR_NO_AUTH.userAgent
 */
const UA_ANDROID_VR =
  'com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Oculus Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)'

/**
 * Android Creator Studio app UA.
 * Source: YouTubeClient.kt:183 ANDROID_CREATOR.userAgent
 */
const UA_ANDROID_CREATOR =
  'com.google.android.apps.youtube.creator/25.03.101 (Linux; U; Android 15; en_US; Pixel 9 Pro Fold; Build/AP3A.241005.015.A2; Cronet/132.0.6779.0)'

/**
 * iOS YouTube app UA.
 * Source: YouTubeClient.kt:109 IOS.userAgent
 */
const UA_IOS =
  'com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)'

/**
 * iPadOS YouTube app UA.
 * Source: YouTubeClient.kt:233 IPADOS.userAgent
 */
const UA_IPADOS =
  'com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)'

/**
 * Samsung Smart TV browser UA.
 * Source: YouTubeClient.kt:87 TVHTML5.userAgent
 */
const UA_TVHTML5 =
  'Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15'

/**
 * PlayStation 4 UA — used by TVHTML5_SIMPLY_EMBEDDED_PLAYER.
 * Source: YouTubeClient.kt:98 TVHTML5_SIMPLY_EMBEDDED_PLAYER.userAgent
 */
const UA_TVHTML5_SIMPLY_EMBEDDED =
  'Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15'

/**
 * Mobile web UA — plausible Chrome Android UA (not present in Echo; sensible default).
 */
const UA_MWEB =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

/**
 * Permissive default — recent Chrome desktop UA.
 * Mirrors the fallback in StreamClientUtils.kt:29 (ANDROID_VR_NO_AUTH.userAgent
 * is used there; we use a desktop Chrome here since it is the safer default for
 * unknown/future clients and passes most CDN checks).
 */
const UA_DEFAULT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ─── Origin / Referer constants ───────────────────────────────────────────────

const ORIGIN_MUSIC = 'https://music.youtube.com'
const REFERER_MUSIC = 'https://music.youtube.com/'
const ORIGIN_YT = 'https://www.youtube.com'
const REFERER_YT = 'https://www.youtube.com/'

// ─── Per-client header map ────────────────────────────────────────────────────

const CLIENT_HEADER_MAP: Record<ClientId, ClientHeaders> = {
  // WEB_REMIX is the YouTube Music web client — music.youtube.com origin.
  // Source: StreamClientUtils.kt:36-39 resolveOriginReferer
  WEB_REMIX: {
    'User-Agent': UA_WEB,
    Origin: ORIGIN_MUSIC,
    Referer: REFERER_MUSIC,
  },

  // Plain WEB is the youtube.com client.
  WEB: {
    'User-Agent': UA_WEB,
    Origin: ORIGIN_YT,
    Referer: REFERER_YT,
  },

  // Embedded player — youtube.com origin.
  WEB_EMBEDDED_PLAYER: {
    'User-Agent': UA_WEB,
    Origin: ORIGIN_YT,
    Referer: REFERER_YT,
  },

  // Creator Studio web — youtube.com origin (creator.youtube.com redirects there).
  // Source: StreamClientUtils.kt:37-39 groups WEB_CREATOR with WEB/WEB_REMIX → music.youtube.com
  // The task spec overrides Echo here: "WEB / non-music → youtube.com".
  WEB_CREATOR: {
    'User-Agent': UA_WEB,
    Origin: ORIGIN_YT,
    Referer: REFERER_YT,
  },

  // Android clients — mobile app UA, no browser Origin/Referer.
  // Source: StreamClientUtils.kt:25 / YouTubeClient.kt MOBILE.userAgent
  ANDROID: {
    'User-Agent': UA_ANDROID,
  },

  // Android Music — same app family UA (not listed separately in Echo; plausible default).
  ANDROID_MUSIC: {
    'User-Agent': UA_ANDROID,
  },

  // Android VR (Oculus).
  // Source: StreamClientUtils.kt:21 / YouTubeClient.kt ANDROID_VR_NO_AUTH.userAgent
  ANDROID_VR: {
    'User-Agent': UA_ANDROID_VR,
  },

  // Android Creator Studio.
  // Source: StreamClientUtils.kt:23 / YouTubeClient.kt ANDROID_CREATOR.userAgent
  ANDROID_CREATOR: {
    'User-Agent': UA_ANDROID_CREATOR,
  },

  // Internal test client — treat as generic Android (not in Echo; sensible default).
  ANDROID_TESTSUITE: {
    'User-Agent': UA_ANDROID,
  },

  // iOS YouTube app.
  // Source: StreamClientUtils.kt:19 / YouTubeClient.kt IOS.userAgent
  IOS: {
    'User-Agent': UA_IOS,
  },

  // iOS YouTube Music — same iOS app family (not in Echo separately; plausible default).
  IOS_MUSIC: {
    'User-Agent': UA_IOS,
  },

  // iPadOS YouTube app.
  // Source: YouTubeClient.kt IPADOS.userAgent (not listed separately in StreamClientUtils.kt)
  IPADOS: {
    'User-Agent': UA_IPADOS,
  },

  // Samsung Smart TV browser.
  // Source: StreamClientUtils.kt:14 / YouTubeClient.kt TVHTML5.userAgent
  // StreamClientUtils.kt gives it youtube.com origin.
  TVHTML5: {
    'User-Agent': UA_TVHTML5,
    Origin: ORIGIN_YT,
    Referer: 'https://www.youtube.com/tv',
  },

  // PlayStation 4 embedded player.
  // Source: StreamClientUtils.kt:15 / YouTubeClient.kt TVHTML5_SIMPLY_EMBEDDED_PLAYER.userAgent
  TVHTML5_SIMPLY_EMBEDDED_PLAYER: {
    'User-Agent': UA_TVHTML5_SIMPLY_EMBEDDED,
    Origin: ORIGIN_YT,
    Referer: 'https://www.youtube.com/tv',
  },

  // Mobile web — Chrome Android UA, youtube.com origin (not in Echo; sensible default).
  MWEB: {
    'User-Agent': UA_MWEB,
    Origin: ORIGIN_YT,
    Referer: REFERER_YT,
  },
}

/**
 * Returns the canonical headers for a CDN URL minted by the given client.
 * Returns a permissive default (recent Chrome desktop UA, no Origin/Referer)
 * when client is unknown.
 */
export function headersForClient(client: ClientId | string): ClientHeaders {
  const known = CLIENT_HEADER_MAP[client as ClientId]
  if (known !== undefined) {
    return known
  }
  return { 'User-Agent': UA_DEFAULT }
}

/**
 * Extracts the `c=<value>` parameter from a stream URL. Returns null when
 * the URL has no `c=` param or is malformed.
 *
 * Example:
 *   parseClientFromUrl('https://rrX---sn-foo.googlevideo.com/videoplayback?c=WEB_REMIX&...')
 *   → 'WEB_REMIX'
 */
export function parseClientFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('c')
  } catch {
    return null
  }
}

/**
 * Convenience: derive ClientHeaders from a stream URL by parsing its `c=` param.
 * Falls back to permissive defaults when the param is missing or unrecognised.
 */
export function headersForUrl(url: string): ClientHeaders {
  const client = parseClientFromUrl(url)
  if (client === null) {
    return { 'User-Agent': UA_DEFAULT }
  }
  return headersForClient(client)
}
