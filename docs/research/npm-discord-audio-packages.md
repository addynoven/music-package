# Discord Music Bot & Audio Streaming npm Packages

Research date: 2026-04-29. Covers the main player/streaming libraries in the Discord.js ecosystem worth reverse-engineering for SDK design ideas.

---

## [@discordjs/voice](https://www.npmjs.com/package/@discordjs/voice)

**Downloads:** ~27k–1.1M/week (wide spread across bot projects; the earlier figure is per-version, total ecosystem usage is in the hundreds of thousands)
**Version:** 0.19.2 — actively maintained inside the discord.js monorepo
**npm URL:** https://www.npmjs.com/package/@discordjs/voice

**What it does:**
The official low-level implementation of the Discord Voice API for Node.js. Handles the WebSocket signalling, UDP voice packets, Opus encoding, and end-to-end encrypted audio (DAVE protocol via `@snazzah/davey`). It is the foundation everything else in this list builds on (or forks from).

**Interesting bits:**

- **Explicit finite state machines.** Both `VoiceConnection` and `AudioPlayer` expose clearly named status enums rather than boolean flags. `VoiceConnectionStatus` has five states: `Signalling → Connecting → Ready → Disconnected → Destroyed`. `AudioPlayerStatus` distinguishes `Idle / Buffering / Playing / AutoPaused / Paused`. You subscribe to transitions with `entersState(connection, VoiceConnectionStatus.Ready, 20_000)` — an async helper that resolves when the state is reached or rejects on timeout. This is a clean pattern for handling async lifecycle without callback hell.

- **Adapter pattern for library agnosticism.** Rather than hard-coding discord.js internals, the package exposes a `DiscordGatewayAdapterCreator` interface. Any Discord library can plug in — Eris, oceanic.js, etc. — by implementing the adapter. Worth copying for any SDK that needs to be framework-neutral.

- **AudioResource + InlineVolume.** `createAudioResource(stream, { metadata, inlineVolume: true })` wraps any Node.js readable. The `metadata` field is generic `<T>` — you staple arbitrary data (track title, interaction ref, whatever) and it comes back on player events. InlineVolume is opt-in because running the PCM volume transform has a real CPU cost even when volume is unchanged — good honest tradeoff documentation.

- **Modular optional deps.** Opus encoding, sodium encryption, and FFmpeg are all optional peer deps. The package picks up whichever is installed (`@discordjs/opus`, `opusscript`, `node-opus`, `sodium`, `libsodium-wrappers`, etc.). This lets consumers choose the native vs JS implementation based on their environment.

- **Audio player sharing.** One `AudioPlayer` can be subscribed to by multiple `VoiceConnection`s simultaneously, broadcasting the same stream to multiple channels with one encode pass.

- **`entersState` + timeout pattern.** Async state waiting with a deadline is underused in SDKs — this is a nice ergonomic primitive worth borrowing.

**Gaps/weaknesses:**

- No queue management at all — intentional, but means everyone rolls their own or reaches for a higher-level library.
- No source resolution (YouTube, Spotify, etc.) — purely about transport.
- Audio *receive* (listening to what users say) is documented as unofficial/unsupported since Discord doesn't publicly spec it.
- Requires Node.js 22.12.0+ as of v0.19.x — can be a blocker in older server environments.
- The discord-player project maintains its own fork (`discord-voip`) because the upstream release cadence doesn't always match what higher-level libs need.

---

## [discord-player](https://www.npmjs.com/package/discord-player)

**Downloads:** ~2.7k/week (niche but the most feature-complete high-level framework)
**Version:** 7.2.0
**npm URL:** https://www.npmjs.com/package/discord-player

**What it does:**
A complete music bot framework built on top of its own `discord-voip` fork. Handles queue management, track metadata filtering, audio filters (64+ presets), source extraction, and repeat modes. Positions itself as "the framework" rather than a library — you implement commands inside its conventions.

**Interesting bits:**

- **Extractors API.** Source adapters are called "extractors" and extend `BaseExtractor`. Each extractor gets an `ExtractorExecutionContext` (access to the player instance, options, etc.) and must implement `validate(url)` and `handle(query)`. The player iterates extractors in registration order and uses the first that validates. This is a clean plugin contract — worth borrowing the `validate → handle` two-step over a single monolithic resolver.

- **React-like hooks.** `useMainPlayer()`, `useQueue()`, `useHistory()` — these are context-scoped helpers that resolve the current player/queue without you explicitly passing them around. The context is provided via `player.context.provide(guildId, callback)` — essentially a continuation-local storage pattern. Inspired by React hooks but applied to a stateful bot runtime. Interesting design for reducing ceremony in command handlers.

- **Guild Nodes (renamed queues).** v7 rebranded queues as "guild nodes" to better reflect that each represents a voice session scoped to one guild. The node holds queue, repeat mode, filters, track history, volume, and metadata (arbitrary `<T>` you pass in). Naming things accurately reduces API confusion downstream.

- **Repeat modes enum.** `QueueRepeatMode.OFF / TRACK / QUEUE / AUTOPLAY` — autoplay is a distinct first-class mode, not a hack. Worth having this as an enum rather than a string or boolean.

- **`onBeforeCreateStream` hook.** An escape hatch at the stream-creation level — you can intercept exactly what gets streamed without writing a full extractor. Useful when you want to swap a CDN URL for a proxied one, inject auth headers, etc.

- **64+ built-in audio filter presets.** Filters are FFmpeg `-af` filter chains applied on the fly. Changing a filter restarts the stream transparently. The filter names are enumerated constants, not magic strings.

- **`@discord-player/equalizer` and `@discord-player/ffmpeg` as sibling packages.** The ecosystem is modular — equalizer is a separate package, FFmpeg detection/management is separate. Good monorepo decomposition.

**Gaps/weaknesses:**

- **YouTube support officially dropped in v7.** The package no longer ships a YouTube extractor. You have to install community packages like `discord-player-youtubei` separately — which themselves carry ToS risk and cookie-based auth that can get accounts banned. This is the single biggest pain point in the community right now.
- Heavy framework buy-in. The hooks/context system only works inside the player's context scope — you can't easily use pieces of this in isolation.
- The `discord-voip` fork diverges from upstream `@discordjs/voice` — potential for drift and security lag.
- `~2.7k/week` is modest; the community is fragmented across distube, discord-player, and direct voice usage.

---

## [distube](https://www.npmjs.com/package/distube)

**Downloads:** ~7k/week (highest in the high-level category)
**Version:** 5.2.3
**npm URL:** https://www.npmjs.com/package/distube

**What it does:**
A Discord.js music library focused on simplicity and breadth. Uses `@discordjs/voice` as a peer dep (not a fork), keeps its own dependency footprint minimal (`tiny-typed-emitter`, `undici`), and delegates source support entirely to a plugin system. The core is intentionally thin.

**Interesting bits:**

- **Plugin-first source resolution.** DisTube core ships with zero source extractors. You register plugins in order and the first plugin whose `validate(url)` returns true handles the request. The `@distube/` org on npm publishes official plugins for YouTube, Spotify, SoundCloud, etc., and there are community plugins for 700+ sites via yt-dlp. The plugin receives a `DisTube` instance reference in its `init(distube)` method — so plugins can hook into the event emitter, access config, etc.

- **FilterManager per queue.** Audio filters are managed per-queue via a `FilterManager` instance (accessible as `queue.filters`). Multiple filters can be combined; changing the active set restarts the underlying FFmpeg pipeline transparently. Filters are FFmpeg `-af` strings under the hood but exposed as named presets (bassboost, echo, karaoke, nightcore, etc.) plus support for raw custom filter strings.

- **Minimal core footprint.** The main package has only 2 runtime dependencies. All the heavy lifting (ytdl, yt-dlp, ffmpeg management) lives in plugins. This is good architecture — the core stays stable and auditable.

- **Event-driven API.** The classic Node.js EventEmitter pattern: `distube.on('playSong', (queue, song) => ...)`. Events are well-named and consistently include the `queue` object as first arg, so you always have context. Compare to discord-player's hooks — DisTube is more conventional but also easier to reason about without learning a new mental model.

- **Peer deps, not bundled deps.** `@discordjs/voice` and `discord.js` v14 are peer deps — you control those versions. This avoids the `discord-voip` fork problem that discord-player has.

- **`undici` for HTTP.** Uses Node.js's built-in-adjacent `undici` for HTTP rather than `node-fetch` or `axios` — modern choice, minimal overhead.

**Gaps/weaknesses:**

- Hard-coupled to `discord.js` v14. There is no adapter/connector pattern — you cannot use DisTube with Eris or any other library. This is by design but is a real limitation for SDK builders who want to be framework-neutral.
- Queue is effectively a first-class singleton per guild — there is no concept of multiple concurrent queues per guild (e.g., for stage channels vs regular voice channels simultaneously).
- The plugin order dependency (first `validate()` wins) means plugin conflicts are implicit and can be hard to debug.
- No built-in track history or "previously played" stack.
- YouTube plugin still depends on ytdl variants that break whenever YouTube rotates their internal API — you end up updating the plugin frequently.

---

## [shoukaku](https://www.npmjs.com/package/shoukaku)

**Downloads:** ~3.2k/week
**Version:** 4.3.0
**npm URL:** https://www.npmjs.com/package/shoukaku

**What it does:**
A thin, stable wrapper around the [Lavalink](https://lavalink.dev/) audio server. Lavalink is a self-hosted Java server that handles all the heavy audio processing (source resolution, FFmpeg, encoding) and exposes a WebSocket API. Shoukaku manages the WebSocket connection, node pooling, reconnection, and player lifecycle — it does not do any audio processing in Node.js itself. No queue management; that's left to wrappers like Kazagumo.

**Interesting bits:**

- **Library-agnostic connector pattern.** `new Shoukaku(connector, nodes, options)` — the connector is swappable. Discord.js and Eris connectors ship out of the box; writing a custom one for any other library is straightforward. This is the cleanest framework-neutral design in this list. Worth studying as a reference for how to write a connector/adapter layer.

- **Node pool with custom resolver.** You can pass a `nodeResolver` function to implement your own node-selection strategy (least-loaded, geographic, priority). The default is round-robin. This is a useful hook for scaling — your SDK can let callers inject their own balancing logic.

- **Failover via `moveOnDisconnect`.** When a Lavalink node drops, Shoukaku can automatically migrate active players to another available node. This is a distributed-system concern handled at the library level — a good model for resilient audio delivery.

- **Separate timeout controls.** REST requests have a configurable timeout (default 60s) separate from voice connection establishment (default 15s). Granular timeout control is useful for production tuning.

- **Resume strategies.** Supports both Lavalink-native session resumption and `resumeByLibrary` (where Shoukaku re-sends voice state on reconnect). Handling both sides of a resume handshake is important for reliability.

- **ESM + CJS dual output.** Ships both module formats — no interop headaches.

- **Intentionally no queue.** The deliberate omission keeps the package small and focused. Queue management is delegated to Kazagumo (a popular Shoukaku wrapper that adds queues, plugin system, and metadata, ~614/week downloads).

**Gaps/weaknesses:**

- Requires a running Lavalink server — this is infrastructure overhead most small bot projects won't want. Not viable for SDK users who want zero-dep playback.
- The Lavalink v4 update moved YouTube into a separate plugin (LavaSrc), so the "just works for YouTube" promise now requires additional Lavalink config.
- No built-in queue — by design, but it means Shoukaku alone is not a drop-in music solution.
- Low-level: you get players, not tracks. Building a full music experience requires layering Kazagumo or an equivalent on top.
- Shoukaku itself has no audio filter management — that's Lavalink's concern, so you send Lavalink filter commands through Shoukaku's player but Shoukaku has no awareness of them.

---

## [play-dl](https://www.npmjs.com/package/play-dl)

**Downloads:** ~tens of thousands/week at peak (now archived — June 7, 2025 — so declining)
**Version:** 1.9.7 (final)
**npm URL:** https://www.npmjs.com/package/play-dl

**What it does:**
A lightweight audio stream fetcher for YouTube, SoundCloud, Spotify, and Deezer. Not a player framework — it just resolves URLs and returns readable streams. Designed to be dropped directly into `createAudioResource()` calls in `@discordjs/voice`. Was the go-to alternative after `ytdl-core` became unreliable.

**Interesting bits:**

- **Pure stream resolution, no player coupling.** The API is a handful of functions: `stream(url)`, `video_basic_info(url)`, `search(query)`, `playlist_info(url)`. No classes, no event emitters, no queue concepts. This is the right level of abstraction for a utility layer — it does one thing and returns a standard Node.js readable.

- **`stream_from_info()` pattern.** You can pre-fetch metadata (`video_basic_info`) and then convert it to a stream separately (`stream_from_info(info)`). This lets you pre-validate tracks (check duration, availability, etc.) before committing to streaming — a useful two-phase pattern.

- **`discordPlayerCompatibility` flag.** A named option on `stream()` that adjusts stream behavior for discord-player's internal expectations. Honest about the tradeoff (breaks seeking on long videos). Demonstrates that explicit compatibility flags beat silent behavior differences.

- **Multi-platform in one package.** YouTube, SoundCloud, Spotify metadata, and Deezer in one install — no plugin wiring needed. The tradeoff is that all platform code ships even if you only use one, but for small bots this is acceptable.

- **100% TypeScript.** Full type inference on return values — `YouTubeVideo`, `SoundCloudTrack`, `SpotifyTrack` are distinct typed shapes, not a generic `Track` blob.

**Gaps/weaknesses:**

- **Archived as of June 2025.** No more updates. YouTube's ongoing anti-bot measures mean unpatched stream fetchers break on a rolling basis. This package is now a liability in production.
- Spotify and Deezer return metadata only — not actual audio streams (those platforms don't expose stream URLs). You still need a YouTube search fallback for playback, which play-dl does internally but it is fragile.
- `discordPlayerCompatibility` mode disables seeking — seeking is a basic feature.
- No retry logic, no rate-limit handling, no proxy support built in.
- Single maintainer, no org — the archival reflects the sustainability problem of fighting YouTube's defenses solo.

---

## Key Takeaways for SDK Design

**Patterns worth borrowing:**

1. **Explicit state machine with named states** (`VoiceConnectionStatus`, `AudioPlayerStatus` from @discordjs/voice). Never use boolean flags for lifecycle — use an enum with a state enum + event on transition.
2. **Adapter/connector pattern** (Shoukaku's `connector` arg) for library agnosticism. Don't hard-code discord.js.
3. **Generic metadata on resources** (`createAudioResource(..., { metadata: T })` from @discordjs/voice). Let consumers attach their own data to tracks without subclassing.
4. **Validate-then-handle extractor contract** (discord-player's `BaseExtractor.validate() + handle()`). Clean two-step plugin interface.
5. **Per-queue FilterManager** (DisTube) rather than global filter state.
6. **Node pool with injectable resolver** (Shoukaku's `nodeResolver`) for horizontal scaling.
7. **`entersState(entity, targetState, timeout)` async helper** — makes async lifecycle waits composable and timeout-safe.

**Gaps the space has (opportunities):**

- No library fully separates **transport**, **source resolution**, **queue management**, and **audio processing** into independently usable packages with clean interfaces between layers. Everyone either does too much or too little.
- YouTube reliability is an unresolved ecosystem-wide problem. No library has a clean multi-provider fallback chain built in.
- Seeking support is consistently fragile or absent across all libraries.
- None of the libraries above handle multi-guild streaming at scale (Shoukaku/Lavalink approaches it via node pools but requires self-hosted infra).
- Receive-side audio (voice recognition, recording) is essentially untouched by all of these packages.
