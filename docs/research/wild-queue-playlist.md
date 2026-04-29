# Wild Find: Queue Management, Playlist Algorithms & Playback State Machines

Research into the npm ecosystem and open-source projects focused on queue management, shuffle algorithms, crossfade scheduling, and gapless playback patterns for a Node.js music streaming SDK.

---

## 1. The npm Ecosystem Snapshot

### Packages Directly Targeting Music Queue / Playlist Logic

**`playback-queue`** (npm, 2016)
The most explicitly named package for this purpose. Accepts an array of tracks (or any object), exposes history tracking, shuffle, and repeat modes. API surface is small — designed to be the pure data-layer queue with no audio I/O. Likely abandoned but worth reading the source as a reference model.

**`@nomercy-entertainment/nomercy-music-player`**
A headless HTML5 audio player written in TypeScript. Ships with shuffle and repeat ('off', 'one', 'all') playback modes with state persistence. Full type safety. Server-side Node.js use is limited (it targets the browser AudioContext) but the type model and state design are directly applicable.

**`distube`** (npm, ~170k weekly downloads as of 2024)
The de-facto queue management library for Discord music bots. Each guild gets its own `Queue` instance managed by a `QueueManager`. Handles: current song, upcoming songs, playback history, play/pause/skip/stop/seek, repeat modes (none / song / queue), autoplay (plays related tracks when queue empties), and a plugin system for YouTube / Spotify / SoundCloud / 700+ sources. Built on `@discordjs/voice`. Requires Node ≥ 22.12. Architecture is a useful reference because it's a battle-tested multi-tenant queue system where "tenants" are Discord guilds.

**`@synesthesia-project/precise-audio`** (npm)
From the Synesthesia lighting+audio project. Uses the Web Audio API to fully decode each track into an `AudioBuffer` before playback, which eliminates codec-level seek inaccuracy. Achieves sample-accurate timing and millisecond-precision seek — the kind of accuracy needed for synchronized crossfade events. The tradeoff: entire tracks loaded into memory. Best for short tracks or situations where seek accuracy beats memory budget.

**`@regosen/gapless-5`** (npm)
Dual-mode gapless player: starts with HTML5 Audio (instant), then seamlessly upgrades to WebAudio once the buffer is decoded. Exposes a `crossfade` option (recommended 25–50 ms to cover encoder gaps). Configurable preload count (default 2 tracks, keep 2–5 for large playlists). XState is not a dependency — it manages state internally.

**`tone`** (npm, ~500k weekly downloads)
Tone.js is the heavy-hitter. Its `Transport` is a global, pauseable, loopable master clock. You schedule events by musical time ("4n", "1m") rather than raw seconds. Methods: `schedule()`, `scheduleRepeat()`, `scheduleOnce()`. Every callback receives the exact scheduled time as an argument — bypassing JS timer jitter entirely. Less about playlist queue management and more about the audio scheduling layer that a crossfade engine sits on top of.

**Priority Queue Libraries (general-purpose but composable):**
- `@datastructures-js/priority-queue` — heap-based, TypeScript, the most-maintained option
- `tinyqueue` (mourner) — smallest implementation, good for embedding
- `heapify` — fastest, zero dependencies, typed arrays under the hood
- `FastPriorityQueue.js` — benchmarked fastest in raw throughput

None of these are music-specific, but they're the right building blocks for weighted queue selection (play high-weight tracks more often).

**Weighted Random Selection:**
- `weighted-random` — simple array + weight input, picks by proportional probability
- `random-weighted-choice` — each item needs `{ id, weight }`, returns the id
- `weighted` — proportional to share of total weight
- `js-weighted-list` (timgilbert) — supports add/remove/peek with weights

---

## 2. Reference Open-Source Projects

### gapless.js (RelistenNet)
- **Repo:** `RelistenNet/gapless.js`
- **Only production dependency:** XState
- **Pattern:** The entire player runs as a rigid XState state machine. Each `TrackInfo` callback exposes `machineState` — the raw internal state identifier — alongside `webAudioLoadingState`, `playbackType`, `currentTime`, `duration`, `playbackRate`.
- **Preloading:** configurable number of tracks preloaded ahead of the current one.
- **Gapless scheduling:** adjusts automatically when playback rate changes (0.25x–4x).
- **ES module only.** No CommonJS.
- **Key insight:** using XState as the *only* dependency forces every state transition through a single auditable machine rather than scattered `if/else` guards. The `machineState` property surfaced to callers means external code can react to internal states without subscribing to imperative events.

### DisTube (skick1234)
- **Repo:** `skick1234/DisTube`
- **Queue architecture:** `QueueManager` holds a Map of guild ID → `Queue`. Each `Queue` tracks current song, upcoming array, history array, `FilterManager` (FFmpeg audio effects), repeat mode enum, and autoplay flag.
- **Plugin resolution:** `DisTubeHandler` iterates registered plugins to find one that validates a URL — clean strategy pattern, no hardcoded sources.
- **Interesting pattern:** "autoplay" is a first-class queue mode, not a bolt-on. When the queue drains, the handler asks the current source plugin for a "related" track and enqueues it automatically.

### Koel (koel/koel + koel/app)
- **Stack:** Laravel (server) + Vue (client)
- **Playback service** imports `queueStore`, `sharedStore`, `userStore`, `songStore`, `preferenceStore` — pure service/store separation. The queue is a reactive store, not embedded in the player.
- **Pattern worth noting:** queue as a store primitive separate from the audio player. The player just consumes `queueStore.current`. This decoupling means you can swap the audio backend without touching queue logic.

### Jellyfin Web (jellyfin/jellyfin-web)
- **Files:** `src/components/playback/playqueuemanager.js` + `playbackmanager.js`
- **Internal state:** `_playlist` (current order), `_sortedPlaylist` (saved original order pre-shuffle), `_repeatMode` ('RepeatNone' | 'RepeatOne' | 'RepeatAll'), `_shuffleMode` ('Sorted' | 'Shuffle'), `_currentPlaylistItemId`.
- **Shuffle pattern:** saves original order in `_sortedPlaylist`, Fisher-Yates shuffles `_playlist`, keeps current item at index 0 of the shuffled result so playback doesn't skip. Toggle-off restores from `_sortedPlaylist` and repositions current track.

### nodeplayer (FruitieX)
- **Repo:** `FruitieX/nodeplayer`
- **Architecture:** thin core that owns the queue array, calls plugin hooks at well-defined lifecycle points (before add, after add, before play, etc.). Without plugins it does nothing — the core is purely queue plumbing.
- **Interesting plugin:** `nodeplayer-plugin-partyplay` — web-based collaborative voting queue where multiple users can suggest and upvote/downvote songs. The queue re-sorts by vote score in real time. A practical implementation of a weighted queue driven by social signals rather than algorithmic weights.

### discord.js voice AudioPlayer
- **States:** `idle` → `buffering` → `playing` ↔ `paused` / `autopaused`
- **AutoPaused** is a distinct state (not just paused) entered when there are no active voice subscribers. Transitions back to `playing` when a subscriber reconnects. This is a pattern worth copying: distinguish "paused by user" from "paused by environment."
- **Source:** `discordjs/voice/src/audio/AudioPlayer.ts`

### Music Assistant (music-assistant/server)
- Python-based, but the domain model is instructive.
- Queue metadata per item includes: `favorite_status`, `explicit_status`, `last_played`, `played_count`. These are the signals needed for intelligent weighted queuing.
- Supports queue transfer to another player device mid-playback (follow-me-around-the-house pattern).

### just_audio (Flutter/Dart)
- **`ConcatenatingAudioSource`** is the gapless queue primitive. Children can be added/removed/reordered dynamically while playing.
- `useLazyPreparation: true` — children load as late as possible before needed. Solves the "5000-track playlist eats all memory on load" problem. On iOS, only items near the front of the queue are loaded.
- Gapless is native on Android/iOS/macOS; there's a slight gap on Web (browser limitation).
- **Pattern:** model the queue as a tree of `AudioSource` nodes (`ConcatenatingAudioSource` wrapping `ClippingAudioSource` wrapping `ProgressiveAudioSource`) rather than a flat array. Enables complex composition (loop a section, clip a track, then continue normally) without mutating the queue array.

---

## 3. Shuffle-Without-Repeat: The Algorithm Landscape

### The Core Problem

True Fisher-Yates shuffle is mathematically unbiased but *perceptually bad*: with n tracks and k artists, random chance frequently places the same artist in consecutive slots. The more concentrated the library (lots of tracks by few artists), the worse it gets.

### Fisher-Yates (Baseline)

The O(n), O(1) space standard. Swap from the back, picking a random index from `[0..i]` at each step. All permutations equally likely. Use it when bias isn't a concern (e.g., genre-homogeneous playlist where any order is fine).

```ts
function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

### Spotify's Dithering Approach (2014, Babar Zafar)

The original fix Spotify shipped after users complained that "shuffle plays the same artist back to back":

1. Group all tracks by artist.
2. For each artist, spread their tracks evenly across the playlist length: `position = (track_index / artist_track_count) * total_tracks`.
3. Apply a random per-artist offset to avoid all artists starting at the same slot.
4. Merge back into a single ordered list.

Result: same-artist tracks are always spread apart. But because it's deterministic modulo the random offset, the "randomness" feels weaker — you can sense the mechanical spacing.

### Ruud van Asseldonk's Merge-Shuffle (2023)

Source: `ruudvanasseldonk.com/2023/an-algorithm-for-shuffling-playlists`

Stronger and more principled than the dithering approach:

1. Partition the playlist by artist into separate lists.
2. Each partition is independently Fisher-Yates shuffled (preserving intra-artist randomness).
3. Merge the partitions using an interleave procedure that always minimizes the maximum consecutive run of any single artist.
4. When two artists would collide (both want the next slot), insert the one with the longer gap since its last appearance.

**Key property:** the result is *optimal* — no algorithm can reduce the maximum consecutive run length further given the same input distribution. If artist A has 10 tracks and artist B has 1 track, A will appear consecutively at most 9 times, which is the theoretical minimum.

The algorithm can be applied recursively: first merge at the album level within each artist, then merge artists into the final playlist.

### KeyJ's Balanced Shuffle (Martin Fiedler, ~2009, still referenced)

Source: `keyj.emphy.de/balanced-shuffle/`

Earlier, simpler version of the same idea. Groups tracks into logical buckets, spreads buckets using a "penalty" mechanism: if the next track's group matches the most recently played group, it's moved to the back of the pending list. Less mathematically rigorous than Ruud's merge-shuffle but easier to implement and good enough for most libraries.

### MusicBee TrueShuffle Pattern

Guarantees every track plays exactly once before any repeats. Maintains a `played` set (persisted to JSON across restarts). Priority: tracks with `playCount === 0` first, then lowest-play-count tracks. Integrates with the host player's "was this track actually listened to?" threshold (% completed or seconds played) before marking a track played. Supports a permanent ban list.

This is the right model when users have large libraries and deep listening histories — playback equity across the catalogue.

### The "Freshness Score" Model (Modern Spotify Smart Shuffle)

Generates hundreds of candidate shuffles. Scores each by:
- How recently each track was last played
- Whether the same artist/album appears in the opening stretch
- Whether repeats appear too quickly

Picks the highest-scoring candidate. This is expensive but the candidate generation and scoring can be parallelized trivially.

---

## 4. Weighted Queues

### The Use Case

Not all tracks are equal in context. You might want to:
- Boost recently added tracks (discovery weight)
- Reduce recently played tracks (recency penalty)
- Increase tracks the user "loves" or has not skipped
- Decrease tracks with high skip rates

### The Data Model

```ts
interface WeightedTrack {
  id: string;
  weight: number;  // computed from signals, updated on events
}

// Signals that adjust weight:
// - playCount: negative correlation (heard less → higher weight)
// - skipCount: strong negative signal (lower weight)
// - loveFlag: boost multiplier (e.g. ×2)
// - lastPlayedAt: recency decay (exponential decay since last play)
// - addedAt: novelty boost (linear decay from add date)
```

### Selection Algorithm

The "roulette wheel" / alias method:

```ts
// O(n) naive, fine for playlists under ~10k tracks
function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}
```

For larger catalogs, the Vose alias method preprocesses in O(n) and selects in O(1).

### npm Primitives

- `random-weighted-choice`: pass `[{ id, weight }]`, get back the selected id. Simple.
- `weighted`: pass items and weights as parallel arrays.
- `@datastructures-js/priority-queue`: good when you need a fixed top-K selection rather than probabilistic random selection (e.g., "always play the 3 highest-weight tracks next, then shuffle the rest").

### The Spicetify Weighted Playlists Pattern

`mwaterman29/spicetify-weighted-playlists`: attaches numeric weights to Spotify tracks, intercepts shuffle to apply weighted selection rather than Fisher-Yates. Simple toggle on/off. The weights are stored in track metadata. Practical proof-of-concept for layering weighted selection on top of an existing queue.

---

## 5. Crossfade Scheduling

### The Fundamental Problem

Audio transitions need to happen at a precise moment in the future. JS `setTimeout` is not reliable enough — browser tab state, garbage collection, and layout work all introduce jitter. The Web Audio API clock (`AudioContext.currentTime`) is sample-accurate and runs independently of the main thread.

### The "Tale of Two Clocks" Pattern

Source: `web.dev/articles/audio-scheduling`

Use a JS timer (`setInterval` at 25–100 ms) to *look ahead* a short window (e.g., 100 ms). For every upcoming crossfade event within that window, schedule it using the Web Audio API's precise scheduler. The JS timer only decides *when to push events into the future*, not when events execute.

```ts
const LOOK_AHEAD_MS = 100;
const SCHEDULE_INTERVAL_MS = 25;

function schedulerTick() {
  const now = audioCtx.currentTime;
  const horizon = now + LOOK_AHEAD_MS / 1000;

  while (nextCrossfadeAt < horizon) {
    scheduleCrossfade(nextCrossfadeAt);
    nextCrossfadeAt += trackDuration;
  }
}

setInterval(schedulerTick, SCHEDULE_INTERVAL_MS);
```

### GainNode Crossfade

```ts
function scheduleCrossfade(
  outNode: GainNode,
  inNode: GainNode,
  startAt: number,   // AudioContext time
  duration: number   // seconds
) {
  outNode.gain.setValueAtTime(1, startAt);
  outNode.gain.linearRampToValueAtTime(0, startAt + duration);

  inNode.gain.setValueAtTime(0, startAt);
  inNode.gain.linearRampToValueAtTime(1, startAt + duration);
}
```

`linearRampToValueAtTime` is fine for crossfades. `exponentialRampToValueAtTime` sounds more natural (equal-power) but cannot ramp to 0. For equal-power crossfade use `setValueCurveAtTime` with a precomputed sine curve, or compute it manually:

```ts
// Equal-power crossfade
const steps = 128;
const fadeOut = new Float32Array(steps).map((_, i) =>
  Math.cos((i / steps) * Math.PI * 0.5)
);
const fadeIn = new Float32Array(steps).map((_, i) =>
  Math.sin((i / steps) * Math.PI * 0.5)
);
outNode.gain.setValueCurveAtTime(fadeOut, startAt, duration);
inNode.gain.setValueCurveAtTime(fadeIn, startAt, duration);
```

### The Click Problem

Abruptly setting gain to 0 at a zero-crossing causes an audible click. Always use `cancelAndHoldAtTime` or `linearRampToValueAtTime(0, t)` to ramp down, never `setValueAtTime(0, t)` when audio is playing.

### Server-Side Crossfade (Node.js, FFmpeg)

For server-rendered streams (radio-style), crossfade is applied via FFmpeg's `acrossfade` filter:

```
ffmpeg -i track1.mp3 -i track2.mp3 -filter_complex acrossfade=d=3:c1=tri:c2=tri output.mp3
```

For streaming pipelines using `fluent-ffmpeg`, pipe the output of one process into the next. The challenge is precision: you need to know the exact sample count of the outgoing track to schedule the crossfade start at the right position. Extract this from the Xing/Info header (LAME gapless metadata) or via `ffprobe`.

### Gapless-5 Approach

Starts HTML5 Audio immediately (low latency), then loads WebAudio decode in the background. Once decoded, transitions seamlessly from HTML5 to WebAudio. Crossfade is an option — at 0 ms it's gapless, at 25+ ms it becomes a crossfade. This hybrid model is a good pattern: fast start with a graceful upgrade to the precise path.

---

## 6. Gapless Playback

### Why It's Hard

MP3 encoders add silence at the start and end of every file (encoder delay and padding). Spec-compliant gapless playback requires:
1. Reading the **Xing/Info MPEG header** embedded by LAME and other encoders. This header contains: encoder delay (samples to skip at start), original file length (samples to use before end-padding begins).
2. Trimming those samples before presenting audio to the output buffer.
3. **Seamlessly concatenating** the trimmed output of track N with the start of track N+1.

### Browser Reality

HTML5 `<audio>` does not support gapless natively — each file goes through full decode/encode/decode cycles with OS-level buffering. You will always get a gap.

`WebAudio + AudioBuffer` is the correct path. Decode each track fully, schedule `source.start(endOfPreviousTrack)` with the trimmed start offset. The scheduled future start ensures zero-gap concatenation.

### Preload Strategy

The standard pattern from gapless.js / just_audio / Gapless-5:
- Maintain a ring buffer of N decoded `AudioBuffer` objects (N = 2–5).
- When the current track starts playing, begin decoding track N+1.
- When 75% through the current track, ensure N+2 is decoded.
- When playback ends and moves to next track, begin decoding N+3 and release the oldest buffer.

Memory cost: a 5-minute 44.1kHz stereo track decoded to PCM = ~100 MB. Keep preload count low for large playlists.

### MSE (Media Source Extensions) for Streaming

For streaming scenarios (tracks fetched over HTTP), the `MediaSource` API allows appending encoded segments progressively. The `web.dev/articles/mse-seamless-playback` article covers how to implement gapless with MSE:
- Pre-roll the first segment of the next track into the source buffer before the current track ends.
- The browser handles gapless at the decoder level if gapless metadata is present in the container.
- Works for MP4/AAC; MP3 over MSE has less consistent gapless support across browsers.

### `@synesthesia-project/precise-audio`

Takes the nuclear option: decode the entire track into an `AudioBuffer` upfront. Seek accuracy is then deterministic and sample-perfect. The cost is memory and load latency. This is the right choice when you need synchronization accuracy (lighting, lyrics, visualizers) more than fast track start.

---

## 7. Playback State Machines

### Why a State Machine

Audio players have notoriously complex state — especially when async operations (buffering, seeking, network errors) interleave with user actions (play, pause, skip). Without a state machine, conditional logic explodes: `if (isPlaying && !isBuffering && !isSeeking)...`. Every edge case becomes a new branch.

### The Canonical States

From studying discord.js voice, ExoPlayer, Sonos, react-native-track-player, and gapless.js:

```
idle
  → loading (track assigned)
    → buffering (network/decode delay)
      → playing
        ↔ paused (user action)
        → autopaused (no subscribers / lost network)
          → playing (subscriber reconnects)
        → ended (track finished)
          → loading (next track) OR idle (queue empty)
        → error
          → idle
    → error
      → idle
```

Key distinctions:
- `autopaused` ≠ `paused`. AutoPaused is environment-driven; the player should self-resume when the environment recovers.
- `buffering` inside `playing` (rebuffering mid-track) vs `buffering` from `loading` (initial load). These are different UX situations.
- `ended` is a transient state that drives queue advancement logic. It should not linger.

### XState for This

gapless.js uses XState as its only dependency. The reason is practical: statecharts handle deeply nested states (buffering is a sub-state of loading, which is a sub-state of active) without state explosion. XState v5 (2024) is ESM-only, leaner, and actor-based.

A minimal audio player machine:

```ts
import { createMachine, assign } from 'xstate';

const playerMachine = createMachine({
  id: 'player',
  initial: 'idle',
  context: { currentTrack: null, error: null },
  states: {
    idle: {
      on: { LOAD: { target: 'loading', actions: assign({ currentTrack: ({ event }) => event.track }) } }
    },
    loading: {
      on: {
        BUFFERING: 'buffering',
        READY: 'playing',
        ERROR: { target: 'error', actions: assign({ error: ({ event }) => event.error }) }
      }
    },
    buffering: {
      on: {
        READY: 'playing',
        ERROR: { target: 'error', actions: assign({ error: ({ event }) => event.error }) }
      }
    },
    playing: {
      on: {
        PAUSE: 'paused',
        END: 'ended',
        BUFFER: 'buffering',
        ERROR: { target: 'error', actions: assign({ error: ({ event }) => event.error }) }
      }
    },
    paused: {
      on: { PLAY: 'playing', STOP: 'idle' }
    },
    ended: {
      always: [
        { target: 'loading', guard: 'hasNextTrack' },
        { target: 'idle' }
      ]
    },
    error: {
      on: { RETRY: 'loading', DISMISS: 'idle' }
    }
  }
});
```

### Queue Integration with the State Machine

The state machine owns *playback state*. The queue is a separate concern. Wire them together at the `ended` transition:

```ts
playerMachine.on('ended', () => {
  const next = queue.advance();  // queue decides next track
  if (next) playerMachine.send({ type: 'LOAD', track: next });
  else playerMachine.send({ type: 'STOP' });
});
```

This separation means you can replace the queue logic (shuffle, weighted, linear) without touching the state machine, and vice versa.

---

## 8. Patterns Worth Stealing

### Dual Sorted/Shuffled Playlist (Jellyfin)

Always maintain two arrays: the *sorted* (original insertion order) and the *active* (currently shuffled). Toggling shuffle off restores from sorted and re-locates current position. This costs 2× memory for the queue but makes shuffle toggle instant and non-destructive.

### History Stack + Back Navigation

Most players implement a `history` stack alongside the forward queue. `previous()` pops from history and pushes current onto the front of the queue. The edge case: if shuffle is active and the user goes back, they return to the *actual previously played track*, not a new random one.

```ts
class Queue<T> {
  private future: T[] = [];
  private history: T[] = [];
  private current: T | null = null;

  advance(): T | null {
    if (this.current) this.history.push(this.current);
    this.current = this.future.shift() ?? null;
    return this.current;
  }

  back(): T | null {
    if (this.current) this.future.unshift(this.current);
    this.current = this.history.pop() ?? null;
    return this.current;
  }
}
```

### Play-Next vs Enqueue

Two distinct user intents that queues often conflate:
- **Play next**: insert at position 1 (immediately after current).
- **Add to queue**: append at the end.

DisTube and Jellyfin both maintain these as separate operations. Internally, track a cursor or a "user-inserted" range before the shuffle-remaining range so that user-inserted "play next" tracks are protected from shuffle.

### Autoplay / Infinite Queue

When the queue drains: ask the source for a related track (based on current track's artist/genre/mood). DisTube delegates this to the plugin that provided the current track. Music Assistant stores `played_count` and `last_played` to avoid re-surfacing recently heard tracks. The anti-repeat logic is the same weighted selection problem.

### Repeat One Without Infinite Loop

`RepeatOne` is easy to implement incorrectly. Simply re-enqueuing the current track can starve the `ended` event if the player self-loops. The clean pattern: let the player reach `ended`, then immediately re-load the same track. This fires the full state machine cycle (ended → loading → playing) which gives you an event hook to intercept and override if needed.

### Per-Queue vs Per-Player Shuffle State

music-assistant's Discussion #5240 highlights a real-world problem: shuffle state attached to the *player* (persistent across queue changes) vs shuffle state attached to the *queue session* (reset when queue is replaced). Most users expect the latter — start a new album, shuffle state resets to off (or re-shuffles the new content). Implement shuffle state as a property of the queue snapshot, not the player.

---

## 9. Gaps in the Ecosystem

1. **No TypeScript-native queue library for music SDKs.** `playback-queue` is 2016 JavaScript. Everything else is either embedded inside a larger player or hand-rolled. There's a clear gap for a lightweight, strongly-typed `@music-sdk/queue` primitive.

2. **No server-side crossfade scheduler for Node.js.** FFmpeg can do it, but there's no npm package that wraps the look-ahead scheduling pattern + GainNode-style API for a server-rendered audio pipeline.

3. **No weighted shuffle that integrates listen signals out of the box.** The weighted random npm packages are generic. Nobody has published "weighted shuffle that accepts listen history events and adjusts weights dynamically."

4. **Gapless in the browser is still fragile.** The MSE + gapless metadata path works for MP4/AAC. MP3 gapless relies on Xing header parsing that few npm packages expose cleanly. There's no standard npm package for "read Xing header, strip encoder delay, gapless-concatenate."

5. **State machine libraries don't ship audio-player-specific machines.** Every project re-invents the `idle → loading → buffering → playing → paused → ended → error` graph. A shared, well-tested machine definition package would have real value.

---

## 10. Quick Reference: Key Sources

- Fisher-Yates: `en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle`
- Spotify dithering algorithm writeup: `medium.com/immensity/how-spotifys-shuffle-algorithm-works-19e963e75171`
- Ruud van Asseldonk merge-shuffle: `ruudvanasseldonk.com/2023/an-algorithm-for-shuffling-playlists`
- KeyJ balanced shuffle: `keyj.emphy.de/balanced-shuffle/`
- Web Audio look-ahead scheduling ("tale of two clocks"): `web.dev/articles/audio-scheduling`
- MSE gapless playback: `web.dev/articles/mse-seamless-playback`
- gapless.js: `github.com/RelistenNet/gapless.js`
- Gapless-5: `github.com/regosen/Gapless-5` / `npmjs.com/package/@regosen/gapless-5`
- DisTube: `github.com/skick1234/DisTube` / `npmjs.com/package/distube`
- precise-audio: `npmjs.com/package/@synesthesia-project/precise-audio`
- Tone.js: `tonejs.github.io` / `npmjs.com/package/tone`
- just_audio ConcatenatingAudioSource: `pub.dev/packages/just_audio`
- Jellyfin PlayQueueManager: `deepwiki.com/jellyfin/jellyfin-web/4.3-play-queue-management`
- discord.js AudioPlayer states: `discordjs.guide/voice/audio-player`
- MusicBee TrueShuffle: `halrad.com/mbtrueshuffle/docs.html`
- playback-queue npm: `npmjs.com/package/playback-queue`
- @datastructures-js/priority-queue: `npmjs.com/package/@datastructures-js/priority-queue`
- random-weighted-choice: `npmjs.com/package/random-weighted-choice`
- XState v5: `stately.ai/docs/xstate`
