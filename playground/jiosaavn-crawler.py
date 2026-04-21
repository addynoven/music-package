"""
JioSaavn API mapper — extracts __call endpoints from JS bundles + probes known patterns.
Run: python3 playground/jiosaavn-crawler.py
Output: playground/jiosaavn-api-map.json
"""

import json
import re
import asyncio
import aiohttp
from urllib.parse import urljoin

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.jiosaavn.com/",
}

BASE = "https://www.jiosaavn.com"
API  = "https://www.jiosaavn.com/api.php"
PROBE_PARAMS = "&api_version=4&_format=json&_marker=0&ctx=web6dot0"


async def fetch(session, url, headers=None, **kwargs):
    h = headers or API_HEADERS
    try:
        async with session.get(url, headers=h, timeout=aiohttp.ClientTimeout(total=10), **kwargs) as r:
            return await r.text()
    except Exception as e:
        return f"ERROR: {e}"


async def get_js_bundles(session):
    """Fetch homepage HTML and extract all JS bundle URLs."""
    print("Fetching homepage to find JS bundles...")
    html = await fetch(session, BASE, headers=HEADERS)
    if html.startswith("ERROR"):
        print(f"  warn: {html}")
        return []
    bundles = re.findall(r'src=["\']([^"\']*\.js(?:\?[^"\']*)?)["\']', html)
    full = []
    for b in bundles:
        url = b if b.startswith("http") else urljoin(BASE, b)
        if any(x in url for x in ["chunk", "main", "app", "vendor", "page", "jiosaavn"]):
            full.append(url)
    print(f"  found {len(full)} JS bundles")
    return full[:20]  # cap at 20 bundles


async def extract_calls_from_js(session, bundles):
    """Download JS bundles and grep for __call= values."""
    calls_found = set()
    for url in bundles:
        js = await fetch(session, url)
        if js.startswith("ERROR"):
            continue
        # Match __call=xxx.yyy patterns
        matches = re.findall(r'__call[=:]["\s]*([a-zA-Z]+\.[a-zA-Z]+)', js)
        for m in matches:
            calls_found.add(m)
        # Also match string literals like "content.getAlbums"
        str_matches = re.findall(r'["\']([a-zA-Z]+\.[a-zA-Z][a-zA-Z]+)["\']', js)
        for m in str_matches:
            if "." in m and not m.startswith("http") and not "/" in m:
                parts = m.split(".")
                if len(parts) == 2 and parts[0][0].islower() and len(parts[0]) > 2:
                    calls_found.add(m)
    return calls_found


async def probe_call(session, call, extra=""):
    """Hit an endpoint and check if it returns valid JSON (not an error)."""
    url = f"{API}?__call={call}{PROBE_PARAMS}{extra}"
    text = await fetch(session, url)
    if text.startswith("ERROR"):
        return {"status": "network_error", "call": call}
    try:
        data = json.loads(text)
        # Detect error responses
        if isinstance(data, dict):
            if data.get("error") or data.get("status") == "failure":
                return {"status": "api_error", "call": call, "msg": str(data)[:80]}
            if "INPUT_INVALID" in text or "REQUIRED" in text:
                return {"status": "needs_params", "call": call}
        return {"status": "ok", "call": call, "preview": text[:120]}
    except Exception:
        return {"status": "non_json", "call": call}


async def main():
    results = {}

    async with aiohttp.ClientSession() as session:
        # Step 1: Extract from JS bundles
        bundles = await get_js_bundles(session)
        js_calls = await extract_calls_from_js(session, bundles)
        print(f"  extracted {len(js_calls)} __call candidates from JS")

        # Step 2: Merge with known calls we've already discovered
        known_calls = {
            "content.getBrowseModules",
            "content.getAlbums",
            "content.getSongs",
            "content.getPlaylists",
            "content.getFeaturedPlaylists",
            "content.getCharts",
            "content.getTrending",
            "content.getTopSongs",
            "content.getTopAlbums",
            "content.getTopArtists",
            "content.getNewAlbums",
            "content.getNewReleases",
            "song.getDetails",
            "song.generateAuthToken",
            "song.getLyrics",
            "lyrics.getLyrics",
            "album.getAlbum",
            "artist.getArtistPageDetails",
            "artist.getArtistMoreAlbum",
            "artist.getArtistMoreSong",
            "playlist.getPlaylist",
            "playlist.getFeaturedPlaylists",
            "webapi.get",
            "webapi.getLyrics",
            "webapi.getBrowseHoverDetails",
            "webapi.getFooterDetails",
            "search.getResults",
            "search.getTopResults",
            "search.getSongResults",
            "search.getAlbumResults",
            "search.getArtistResults",
            "search.getPlaylistResults",
            "autocomplete.get",
            "radio.createFeaturedStation",
            "radio.createEntityStation",
            "radio.createArtistStation",
            "radio.getSong",
            "reco.getreco",
            "reco.getSongReco",
            "reco.getPlaylistReco",
            "reco.getAlbumReco",
        }

        all_calls = known_calls | js_calls
        print(f"\nProbing {len(all_calls)} total endpoints...")

        # Step 3: Probe each call
        tasks = [probe_call(session, call) for call in sorted(all_calls)]
        probes = await asyncio.gather(*tasks)

        for r in probes:
            results[r["call"]] = r

        # Step 4: For working calls, probe with language variants
        working = [r["call"] for r in probes if r["status"] == "ok"]
        print(f"\n{len(working)} endpoints returned OK responses")

        lang_results = {}
        for call in working:
            tamil = await probe_call(session, call, "&languages=tamil")
            hindi = await probe_call(session, call, "&languages=hindi")
            eng   = await probe_call(session, call, "&languages=english")
            # Real language support = responses differ in size between languages
            sizes = {r["call"]: len(r.get("preview", "")) for r in [tamil, hindi, eng]}
            all_ok = all(r["status"] == "ok" for r in [tamil, hindi, eng])
            previews = [r.get("preview", "") for r in [tamil, hindi, eng]]
            actually_differs = len(set(previews)) > 1
            lang_results[call] = {
                "all_ok": all_ok,
                "actually_differs": actually_differs,
            }

    # Output
    output = {
        "summary": {
            "total_probed": len(results),
            "working": [c for c, r in results.items() if r["status"] == "ok"],
            "needs_params": [c for c, r in results.items() if r["status"] == "needs_params"],
            "errors": [c for c, r in results.items() if r["status"] == "api_error"],
        },
        "endpoints": results,
        "language_support": lang_results,
    }

    out_path = "playground/jiosaavn-api-map.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n=== RESULTS ===")
    print(f"Working endpoints ({len(output['summary']['working'])}):")
    for c in sorted(output["summary"]["working"]):
        lr = lang_results.get(c, {})
        if lr.get("actually_differs"):
            lang = "✅ REAL lang filter"
        elif lr.get("all_ok"):
            lang = "⚠️  accepts lang param but no effect"
        else:
            lang = ""
        print(f"  {c:<45} {lang}")

    print(f"\nNeeds params ({len(output['summary']['needs_params'])}):")
    for c in sorted(output["summary"]["needs_params"]):
        print(f"  {c}")

    print(f"\nSaved full results to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
