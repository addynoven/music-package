# Wild TypeScript SDK Patterns

> Research into best-in-class TypeScript SDK design from the npm ecosystem.
> Packages studied: neverthrow, ts-pattern, zod, effect, trpc, drizzle-orm, kysely, openai-node, ky, got, zustand, tanstack-query.
> Goal: identify patterns worth applying to this SDK.

---

## 1. Result Types vs. Exceptions

**Package: neverthrow**

The core insight is making failure visible in the type signature. Instead of `Promise<Song>` that might throw anything, you get `Result<Song, MusicKitError>` where the caller is forced to handle both paths.

```typescript
// The discriminated union
export type Result<T, E> = Ok<T, E> | Err<T, E>

// Ok class — success path
export class Ok<T, E> {
  constructor(readonly value: T) {}
  isOk(): this is Ok<T, E> { return true }
  isErr(): this is Err<T, E> { return false }

  map<A>(f: (t: T) => A): Result<A, E> { return ok(f(this.value)) }
  mapErr<U>(_f: (e: E) => U): Result<T, U> { return ok(this.value) }
  andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F> { return f(this.value) }
  unwrapOr<A>(_v: A): T | A { return this.value }
  match<A, B = A>(ok: (t: T) => A, _err: (e: E) => B): A | B { return ok(this.value) }
}

// Err class — failure path
export class Err<T, E> {
  constructor(readonly error: E) {}
  isOk(): this is Ok<T, E> { return false }
  isErr(): this is Err<T, E> { return true }

  map<A>(_f: (t: T) => A): Result<A, E> { return err(this.error) }
  andThen<U, F>(_f: (t: T) => Result<U, F>): Result<U, E | F> { return err(this.error) }
  unwrapOr<A>(v: A): T | A { return v }
  match<A, B = A>(_ok: (t: T) => A, err: (e: E) => B): A | B { return err(this.error) }
}

// Factory functions
export const ok = <T, E = never>(value: T): Ok<T, E> => new Ok(value)
export const err = <T = never, E = unknown>(error: E): Err<T, E> => new Err(error)
```

**The key DX property:** `isOk()` and `isErr()` use `this is` type predicates so TypeScript narrows the type in the branch. After `if (result.isOk())`, the compiler knows `result.value` exists.

**Async variant** for promise-heavy SDKs:

```typescript
class ResultAsync<T, E> implements PromiseLike<Result<T, E>> {
  constructor(private _promise: Promise<Result<T, E>>) {}

  static fromPromise<T, E>(
    promise: Promise<T>,
    mapErr: (e: unknown) => E
  ): ResultAsync<T, E> {
    return new ResultAsync(promise.then(ok, (e) => err(mapErr(e))))
  }

  andThen<U, F>(f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
    return new ResultAsync(
      this._promise.then(result =>
        result.isOk() ? f(result.value) : errAsync(result.error)
      )
    )
  }
}
```

**Chain usage** (the real payoff):

```typescript
const getTrackAndLyrics = (id: string): ResultAsync<TrackWithLyrics, MusicKitError> =>
  ResultAsync.fromPromise(mk.getStream(id), toMusicError)
    .andThen(stream => ResultAsync.fromPromise(mk.getMetadata(id), toMusicError)
      .map(meta => ({ ...meta, stream }))
    )
    .andThen(track =>
      ResultAsync.fromPromise(mk.getLyrics(id), toMusicError)
        .map(lyrics => ({ ...track, lyrics }))
    )
```

Each `.andThen()` short-circuits if any step fails. No try/catch pyramid.

**When to use it vs. throwing:** Result types work best at the public SDK boundary — the methods callers call. Internal helpers can still throw. The wrapping happens at one layer, not everywhere.

**Zod's version of the same idea** — `safeParse()` returns a structurally identical discriminated union:

```typescript
// parse() — throws ZodError
export type $Parse = <T extends $ZodType>(schema: T, value: unknown) => output<T>

// safeParse() — returns discriminated union, never throws
export type $SafeParse = <T extends $ZodType>(
  schema: T, value: unknown
) => SafeParseResult<output<T>>

// SafeParseResult
type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: ZodError }
```

The pattern: expose both. `parse()` for users who want exceptions, `safeParse()` for users who want explicit handling. Our SDK only throws today — we could offer `getSafeStream()` variants.

---

## 2. Discriminated Unions for Domain Types

**Pattern: "type" discriminant on every variant**

Every content type in this SDK already uses this — `Song | Album | Artist | Playlist` each carry a `type` field. That's correct. The patterns to study from the ecosystem go deeper.

**TanStack Query's state machine approach:**

```typescript
// Each state is its own type with unique fields — not just a status string
type QueryObserverPendingResult<TData, TError> = {
  status: 'pending'
  isPending: true
  isError: false
  isSuccess: false
  data: undefined
  error: null
}

type QueryObserverSuccessResult<TData, TError> = {
  status: 'success'
  isPending: false
  isError: false
  isSuccess: true
  data: TData       // never undefined here
  error: null
}

type QueryObserverErrorResult<TData, TError> = {
  status: 'error'
  isPending: false
  isError: true
  isSuccess: false
  data: TData | undefined
  error: TError     // never null here
}

type QueryObserverResult<TData, TError> =
  | QueryObserverPendingResult<TData, TError>
  | QueryObserverSuccessResult<TData, TError>
  | QueryObserverErrorResult<TData, TError>
```

The critical technique: boolean convenience fields (`isPending`, `isSuccess`, `isError`) are typed as literal `true`/`false` per variant. So after narrowing on `result.status === 'success'`, TypeScript knows `result.data` is `TData`, not `TData | undefined`. Callers never need to null-check data inside a success branch.

**Applied to this SDK:** The streaming pipeline has multiple states (resolving URL, fetching, ready, expired). A discriminated union for `StreamState` would eliminate the `expiresAt` null checks scattered everywhere.

**ts-pattern for exhaustive matching:**

```typescript
import { match, P } from 'ts-pattern'

const result = match(mediaItem)
  .with({ type: 'song' }, (song) => renderSong(song))
  .with({ type: 'album' }, (album) => renderAlbum(album))
  .with({ type: 'artist' }, (artist) => renderArtist(artist))
  .with({ type: 'playlist' }, (playlist) => renderPlaylist(playlist))
  .exhaustive()  // compile error if a variant is unhandled
```

The `match()` function signature:

```typescript
function match<const input, output = symbols.unset>(
  value: input
): Match<input, output>

// .with() accepts patterns and handler
.with(...patterns, handler): MatchExpression<input, output>

// .exhaustive() — compile error if union isn't fully covered
.exhaustive(): output

// .otherwise() — explicit default case
.otherwise(handler: (value: input) => output): output
```

The value over a switch statement: exhaustiveness is checked at compile time, not runtime. Add a new `type: 'podcast'` to `MediaItem` and every `.exhaustive()` call fails to compile until handled.

---

## 3. Branded / Nominal Types

**The problem they solve:** `videoId`, `channelId`, `playlistId` are all `string` at runtime. Nothing stops passing a `channelId` where a `videoId` is expected. Branded types add zero runtime cost but make the compiler catch this.

**The simple version (no external deps):**

```typescript
declare const brand: unique symbol

type Brand<T, B extends string> = T & { readonly [brand]: B }

// Specific ID types
type VideoId     = Brand<string, 'VideoId'>
type ChannelId   = Brand<string, 'ChannelId'>
type PlaylistId  = Brand<string, 'PlaylistId'>
type BrowseId    = Brand<string, 'BrowseId'>
type JioId       = Brand<string, 'JioId'>     // jio: prefixed IDs

// Smart constructors — the only way to create them
const VideoId = (s: string): VideoId => s as VideoId
const JioId   = (s: string): JioId   => {
  if (!s.startsWith('jio:')) throw new Error(`Not a JioSaavn ID: ${s}`)
  return s as JioId
}
```

**After branding, the API becomes self-documenting:**

```typescript
// Before — any string can go anywhere
async getStream(videoId: string): Promise<StreamingData>
async getArtist(channelId: string): Promise<Artist>

// After — passing a ChannelId to getStream is a compile error
async getStream(videoId: VideoId): Promise<StreamingData>
async getArtist(channelId: ChannelId): Promise<Artist>
```

**Zod's approach** (brand at parse time):

```typescript
const VideoIdSchema = z.string()
  .regex(/^[a-zA-Z0-9_-]{11}$/)
  .brand<'VideoId'>()

type VideoId = z.infer<typeof VideoIdSchema>

// Validates + brands in one step
const id = VideoIdSchema.parse(userInput)  // → VideoId (branded)
```

**type-fest's Tagged** (more sophisticated, supports metadata):

```typescript
import type { Tagged } from 'type-fest'

type VideoId   = Tagged<string, 'VideoId'>
type Seconds   = Tagged<number, 'Seconds'>
type Decibels  = Tagged<number, 'Decibels'>
```

**The key rule:** only apply branding where confusability causes real bugs. `videoId` vs `channelId` is a real risk in this SDK because both are plain strings and the routing logic depends on telling them apart. Duration in seconds vs milliseconds is also a real risk. Apply selectively — not to every string in the codebase.

---

## 4. Fluent Builder Pattern

**What it is:** Instead of a single function with 15 options, you chain method calls that each set one piece of state. The builder accumulates state and fires on a terminal method.

**Drizzle ORM** — type state threading through the chain:

```typescript
// Each .select() call intersects the result type
interface SelectQueryBuilder<DB, TB extends keyof DB, O> {
  select<SE extends SelectExpression<DB, TB>>(
    selection: SE
  ): SelectQueryBuilder<DB, TB, O & Selection<DB, TB, SE>>

  where(condition: Expression<SqlBool>): SelectQueryBuilder<DB, TB, O>
  orderBy(...columns: OrderByExpression<DB, TB, O>[]): SelectQueryBuilder<DB, TB, O>
  limit(limit: number): SelectQueryBuilder<DB, TB, O>

  // Terminal methods — different return types
  execute(): Promise<O[]>
  executeTakeFirst(): Promise<O | undefined>
  executeTakeFirstOrThrow(): Promise<O>
}
```

The generic `O` accumulates the selected columns as you chain `.select()` calls. By the time you call `.execute()`, TypeScript knows exactly what shape each row has.

**Kysely** goes further — joins affect nullability in the type:

```typescript
// Inner join: joined columns are non-null
innerJoin<TE extends TableExpression<DB, TB>>(
  table: TE, condition: ...
): SelectQueryBuilderWithInnerJoin<DB, TB, O, TE>

// Left join: joined columns become nullable
leftJoin<TE extends TableExpression<DB, TB>>(
  table: TE, condition: ...
): SelectQueryBuilderWithLeftJoin<DB, TB, O, TE>
```

**Applied to this SDK:** A download builder is a natural fit here:

```typescript
// Current API — options object
await mk.download(id, {
  path: './music',
  format: 'opus',
  quality: 'high',
  onProgress: (p) => console.log(p.percent)
})

// Builder API — each step is a separate concern
await mk.download(id)
  .to('./music')
  .as('opus')
  .quality('high')
  .onProgress((p) => console.log(p.percent))
  .exec()
```

The builder approach has a real advantage when options have dependencies on each other — the type system can enforce that `.onProgress()` is only valid when format is streaming, for example.

**The `ts-pattern` builder** is the clearest example of a pure builder chain where each step refines the TypeScript generic:

```typescript
match(mediaItem)           // Match<MediaItem, unset>
  .with({ type: 'song' },  // MatchExpression<MediaItem, ReturnType>
    song => ...)
  .with({ type: 'album' },
    album => ...)
  .exhaustive()            // returns the output — terminates the chain
```

---

## 5. Plugin / Extension Architecture

**Three distinct patterns worth knowing:**

### Pattern A: Middleware via module augmentation (Zustand)

The core type registers a hook interface that plugins can extend:

```typescript
// In the core library
interface StoreMutators<S, A> {}

// Each middleware declares its presence by augmenting this interface
declare module '../vanilla' {
  interface StoreMutators<S, A> {
    'zustand/devtools': WithDevtools<S>   // adds .devtools property + action param to setState
    'zustand/persist':  WithPersist<S>    // adds .persist property
    'zustand/immer':    WithImmer<S>      // changes setState to accept draft mutation
  }
}

// The Mutate<S, Ms> utility recursively applies these
type Mutate<S, Ms extends [...any[]]> = Ms extends [[infer Mi, infer Ma], ...infer Mrs]
  ? Mutate<StoreMutators<S, Ma>[Mi & StoreMutatorIdentifier], Mrs>
  : S
```

**Middleware wraps StateCreator via currying:**

```typescript
type Devtools = <T, Mps extends [...any[]], Mcs extends [...any[]]>(
  initializer: StateCreator<T, [...Mps, ['zustand/devtools', never]], Mcs>,
  options?: DevtoolsOptions
) => StateCreator<T, Mps, [['zustand/devtools', never], ...Mcs]>

// The middleware itself is a triple-nested function
const devtools: Devtools = (fn, options) => (set, get, api) => {
  // Intercept api.setState to report to Redux DevTools
  const originalSetState = api.setState
  api.setState = (state, replace, action) => {
    originalSetState(state, replace, action)
    sendToDevtools(action, api.getState())
  }
  return fn(set, get, api)
}
```

### Pattern B: Instance inheritance via `.extend()` (ky / got)

Create a new client instance that inherits all defaults, with the ability to override:

```typescript
// ky's approach
type KyInstance = {
  extend(options: Partial<Options>): KyInstance
  extend(options: (parentDefaults: Options) => Partial<Options>): KyInstance
}

// Functional composition — defaults can be computed from parent
const authedKy = ky.extend(defaults => ({
  ...defaults,
  headers: {
    ...defaults.headers,
    Authorization: `Bearer ${getToken()}`
  }
}))

// Got's handler-based approach
type HandlerFunction = <T extends GotReturn>(
  options: Options,
  next: (options: Options) => T
) => T | Promise<T>

type Got = {
  extend<T extends Array<Got | ExtendOptions>>(...configs: T): Got<MergeExtendsConfig<T>>
}
```

The key: `extend()` returns the same type (`KyInstance`/`Got`), so chains can be chained. `got.extend(authPlugin).extend(retryPlugin)` works and preserves all types.

**Applied to this SDK:** A `withSource()` method that returns a new `MusicKit` instance locked to a specific source:

```typescript
const jioSaavn = mk.extend({ sourceOrder: ['jiosaavn'] })
const youtube  = mk.extend({ sourceOrder: ['youtube'] })
// jioSaavn.search('song') — always uses JioSaavn, fully typed
```

### Pattern C: Interface extension via declaration merging (TanStack Query)

Users can augment library interfaces to add their own metadata types:

```typescript
// In tanstack-query
export type QueryMeta = Register extends { queryMeta: infer TQueryMeta }
  ? TQueryMeta
  : Record<string, unknown>

// In user code — augment the Register interface
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      source: 'youtube' | 'jiosaavn'
      cacheStrategy: 'aggressive' | 'normal'
    }
  }
}

// Now QueryMeta is your custom type across the whole library
```

This is purely a TypeScript mechanism — zero runtime cost. Ideal for "escape hatches" where the library wants users to be able to extend its type surface without forking it.

---

## 6. The APIResource / Sub-resource Hierarchy Pattern

**Package: openai-node** (Stainless-generated SDK, the gold standard for REST SDKs)

The `APIResource` base class is beautifully minimal:

```typescript
export abstract class APIResource {
  protected _client: OpenAI
  constructor(client: OpenAI) {
    this._client = client
  }
}
```

Sub-resources extend this and get the client reference automatically:

```typescript
export class Chat extends APIResource {
  completions: Completions = new Completions(this._client)
}

export class Completions extends APIResource {
  async create(body: CompletionCreateParams): Promise<ChatCompletion> {
    return this._client.post('/chat/completions', { body })
  }
}

// Top-level client composes everything
export class OpenAI {
  chat: Chat = new Chat(this)
  completions: Completions = new Completions(this)
  models: Models = new Models(this)
  // ...
}
```

**Usage:** `openai.chat.completions.create({...})` — namespace hierarchy mirrors the API structure.

**`APIPromise<T>`** — extends `Promise` to add SDK-specific features:

```typescript
export class APIPromise<T> extends Promise<WithRequestID<T>> {
  // Returns raw Response without parsing body
  asResponse(): Promise<Response>

  // Returns both parsed data and raw response
  withResponse(): Promise<{ data: T; response: Response; requestId: string }>

  // Lazy parsing — body only parsed when .then() is called
  private parsedPromise: Promise<WithRequestID<T>> | undefined
}
```

The `withResponse()` pattern is excellent DX for debug scenarios — users can inspect HTTP headers without a separate call.

**Applied to this SDK:** The current `MusicKit` class does everything. Splitting into namespaced resources would make the API more explorable:

```typescript
mk.search.songs('query')
mk.search.albums('query')
mk.browse.artist('channelId')
mk.browse.album('browseId')
mk.stream.get('videoId')
mk.stream.pcm('videoId')
mk.lyrics.get('videoId')
```

---

## 7. Tree-shaking Friendly Exports

**The core constraint:** bundlers can dead-code-eliminate only what they can prove is unused. Two things break this: side effects and `export *`.

**`sideEffects: false`** in `package.json` — the single most important tree-shaking signal:

```json
{
  "sideEffects": false
}
```

This tells bundlers (webpack, rollup, esbuild) that importing any module from this package has no observable side effects, so unused exports can be removed. Zod, neverthrow, and virtually every well-maintained utility library sets this.

**Dual ESM/CJS exports** — the modern `exports` field structure:

```json
{
  "exports": {
    ".": {
      "types":   "./dist/index.d.ts",
      "import":  "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./stream": {
      "types":   "./dist/stream/index.d.ts",
      "import":  "./dist/stream/index.mjs",
      "require": "./dist/stream/index.cjs"
    },
    "./sources/jiosaavn": {
      "types":   "./dist/sources/jiosaavn/index.d.ts",
      "import":  "./dist/sources/jiosaavn/index.mjs",
      "require": "./dist/sources/jiosaavn/index.cjs"
    }
  }
}
```

Subpath exports let users import only the JioSaavn source, or only the stream resolver, if they want finer-grained bundling.

**Zod's approach** (reference) — also ships source TypeScript:

```json
{
  "sideEffects": false,
  "exports": {
    ".": {
      "@zod/source": "./src/index.ts",
      "types":       "./dist/index.d.cts",
      "import":      "./dist/index.mjs",
      "require":     "./dist/index.cjs"
    },
    "./mini":   { ... },
    "./v4":     { ... },
    "./v4/core": { ... }
  }
}
```

The `@zod/source` condition ships the raw `.ts` files for bundlers that can handle TypeScript natively (Vite, Bun).

**Avoid re-exporting everything from index:**

```typescript
// BAD — forces bundler to include all modules
export * from './sources/youtube-music'
export * from './sources/jiosaavn'
export * from './stream'
export * from './lyrics'

// GOOD — explicit named exports from a barrel that's individually importable
export { YouTubeMusicSource } from './sources/youtube-music'
export { JioSaavnSource }     from './sources/jiosaavn'
export { StreamResolver }     from './stream'
// Types — zero runtime cost
export type { Song, Album, Artist, Playlist, StreamingData } from './models'
```

**TypeScript declaration file impact:**

Adding explicit return type annotations to public methods prevents TypeScript from generating complex inferred types in `.d.ts` files. This matters for large SDKs where declaration emit becomes slow:

```typescript
// BAD — TypeScript must infer and serialize a complex type into .d.ts
async search(query: string, options?: SearchOptions) {
  // ...complex implementation
}

// GOOD — explicit return type, TypeScript knows it immediately
async search(query: string, options?: SearchOptions): Promise<SearchResults> {
  // ...complex implementation
}
```

---

## 8. Overload Signatures for Multiple Return Types

**Our `search()` already uses this pattern well.** The TypeScript handbook's rules for overload ordering are worth locking in:

**Rule: specific overloads before general, narrow before wide:**

```typescript
// WRONG — general overload first hides specific ones
declare function fn(x: unknown): unknown
declare function fn(x: HTMLDivElement): string   // unreachable

// CORRECT — most specific first
declare function fn(x: HTMLDivElement): string
declare function fn(x: HTMLElement): number
declare function fn(x: unknown): unknown
```

**Rule: use union types instead of multiple overloads when the only difference is one param:**

```typescript
// WRONG — overloads for a union param
interface SDK {
  getById(id: string): Song
  getById(id: number): Song
}

// CORRECT
interface SDK {
  getById(id: string | number): Song
}
```

**Rule: use optional params instead of trailing overloads:**

```typescript
// WRONG
interface SDK {
  search(query: string): SearchResults
  search(query: string, filter: SearchFilter): SearchResults
  search(query: string, filter: SearchFilter, limit: number): SearchResults
}

// CORRECT
interface SDK {
  search(query: string, filter?: SearchFilter, limit?: number): SearchResults
}
```

**Rule: callbacks should use `void` return, not `any`:**

```typescript
// WRONG — any allows accidental use of return value
onProgress: (p: DownloadProgress) => any

// CORRECT — void means "we don't use the return value"
onProgress: (p: DownloadProgress) => void
```

**The search() overload pattern used in this SDK** (already correct):

```typescript
async search(query: string, options: { filter: 'songs' }): Promise<Song[]>
async search(query: string, options: { filter: 'albums' }): Promise<Album[]>
async search(query: string, options: { filter: 'artists' }): Promise<Artist[]>
async search(query: string, options: { filter: 'playlists' }): Promise<Playlist[]>
async search(query: string, options?: { filter?: SearchFilter }): Promise<SearchResults>
```

Most specific (literal string filter) before least specific (union | undefined). This is the correct ordering.

---

## 9. Typed Error Hierarchy

**Pattern: extend `Error` with discriminated `code` field**

Several high-quality SDKs use a similar structure. The key: the `code` field uses a const object (or string literal union) rather than an enum, so callers can switch on it without importing the enum:

```typescript
// const object pattern (more tree-shakeable than enum)
export const ErrorCode = {
  RateLimited:      'RATE_LIMITED',
  NotFound:         'NOT_FOUND',
  VideoUnavailable: 'VIDEO_UNAVAILABLE',
  NetworkError:     'NETWORK_ERROR',
  ParseError:       'PARSE_ERROR',
  Unknown:          'UNKNOWN',
} as const

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode]

// Base error class
export class SDKError extends Error {
  readonly code: ErrorCode
  readonly statusCode?: number
  readonly endpoint?: string

  constructor(message: string, code: ErrorCode, options?: {
    statusCode?: number
    endpoint?: string
    cause?: unknown
  }) {
    super(message, { cause: options?.cause })
    this.name = 'SDKError'
    this.code = code
    this.statusCode = options?.statusCode
    this.endpoint = options?.endpoint
  }
}

// Specific subclasses for instanceof checks + narrowing
export class RateLimitError extends SDKError {
  readonly retryAfterMs?: number
  constructor(msg: string, retryAfterMs?: number) {
    super(msg, ErrorCode.RateLimited)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export class NotFoundError extends SDKError {
  constructor(msg: string, readonly resource?: string) {
    super(msg, ErrorCode.NotFound)
    this.name = 'NotFoundError'
  }
}
```

**Got / ky's error hierarchy** pattern:

```typescript
export type isHTTPError   = (error: unknown) => error is HTTPError
export type isNetworkError = (error: unknown) => error is NetworkError

// Type guard functions make narrowing ergonomic
function handleError(error: unknown) {
  if (isHTTPError(error) && error.response.status === 404) { ... }
  if (isRateLimitError(error)) {
    await sleep(error.retryAfterMs ?? 1000)
  }
}
```

**The `cause` chain** (Node 16.9+ / ES2022): always pass the original error as `cause` when wrapping:

```typescript
catch (e) {
  throw new NetworkError('Stream fetch failed', {
    statusCode: response.status,
    cause: e   // preserves original stack for debugging
  })
}
```

---

## 10. The `Register` Pattern for User-Land Type Extension

**Package: TanStack Query**

This is a TypeScript module augmentation pattern that lets the library's types be globally extended by user code without any runtime overhead:

```typescript
// In the library
interface Register {}   // empty by default

// The library reads from Register conditionally
export type QueryMeta = Register extends { queryMeta: infer T }
  ? T
  : Record<string, unknown>  // default fallback

export type DefaultError = Register extends { defaultError: infer T }
  ? T
  : Error  // default fallback
```

```typescript
// In user code — augment Register to change library-wide types
declare module 'musicstream-sdk' {
  interface Register {
    defaultError: MusicKitError         // all results now use typed errors
    songMeta: { source: SourceName }    // Song.meta is now typed
  }
}
```

This gives users a first-class escape hatch to specialize library types for their application without needing to wrap every type. The key: the library checks `Register extends { key: infer T }` — if the key exists, use T; otherwise, use the default. Zero overhead, no runtime impact.

---

## 11. Versioning Strategy

**Semver discipline:** SDKs have stricter obligations than apps.

**Breaking changes require a major version bump:**
- Removing a method or property
- Changing a method's return type (e.g., `Song` → `Song | null`)
- Adding required fields to an options object
- Narrowing what inputs are accepted

**Non-breaking (minor/patch):**
- Adding optional fields to return types
- Adding optional parameters
- Adding new methods
- New exports

**Deprecation before removal:**

```typescript
/** @deprecated Use getSuggestions() instead. Will be removed in v2. */
async getRelated(videoId: string): Promise<Song[]> {
  return this.getSuggestions(videoId)
}
```

**The `_experimental_` prefix pattern** (used by several SDKs):

```typescript
// Stable methods — semver guaranteed
async search(query: string): Promise<SearchResults>

// Experimental — can break without major bump
async _experimental_vectorSearch(embedding: number[]): Promise<Song[]>
```

**Changeset-based releases** (the current gold standard in the npm ecosystem): each PR includes a `.changeset/` file declaring patch/minor/major with a human description. On merge to main, Changesets auto-versions and updates CHANGELOG.md.

---

## 12. The `withResponse()` Pattern

**Package: openai-node**

```typescript
class APIPromise<T> extends Promise<WithRequestID<T>> {
  // Get just the data — normal promise behavior
  // await openai.chat.completions.create({...})  → ChatCompletion

  // Get data + raw HTTP response + request ID
  // await openai.chat.completions.create({...}).withResponse()
  withResponse(): Promise<{ data: T; response: Response; requestId: string }>

  // Get raw Response without parsing body
  asResponse(): Promise<Response>
}
```

This is excellent DX for debugging. The user doesn't need a second call to inspect rate-limit headers or the X-Request-ID. Our `.call()` wrapper could return this — `mk.search(q).withMeta()` → `{ data: SearchResults; cacheHit: boolean; source: SourceName; durationMs: number }`.

---

## 13. Practical Application to This SDK

Ranked by impact/effort ratio:

**High impact, low effort:**

1. **`sideEffects: false` in package.json** — one line, immediate tree-shaking benefit for any bundler.

2. **Explicit return type annotations on all public methods** — prevents complex inferred types in `.d.ts`, speeds up consumer compilation.

3. **Const error codes instead of strings** — replace the current `MusicKitErrorCode` const object (already done correctly) with concrete subclasses (`RateLimitError`, `NotFoundError`) so callers can use `instanceof` instead of checking `.code`.

4. **`void` on all callback return types** — `onProgress: (p) => void` not `onProgress: (p) => any`.

**Medium impact, medium effort:**

5. **Branded IDs for `VideoId`, `ChannelId`, `PlaylistId`** — prevents routing bugs at compile time. The `resolveInput()` function becomes the smart constructor.

6. **`safeParse()`-style variants for key methods** — `getSafeStream()`, `safeSearch()` that return `Result<T, MusicKitError>` instead of throwing. Let callers choose their error model.

7. **`withMeta()` on public methods** — `mk.search(q).withMeta()` returns `{ data, source, cacheHit, durationMs }`. Useful for debugging and observability without adding logger overhead.

**Higher effort, architectural:**

8. **Namespace hierarchy** — `mk.search.songs()`, `mk.browse.artist()`, `mk.stream.get()` instead of flat methods on MusicKit. More discoverable with IDE autocomplete.

9. **Download builder** — `mk.download(id).to('./music').as('opus').quality('high').exec()` replaces the options object for download configuration.

10. **`extend()` method** — create a new MusicKit instance with merged config. Enables `const jioKit = mk.extend({ sourceOrder: ['jiosaavn'] })` as a first-class pattern.

---

## Key Files and Packages Referenced

| Package | What to study |
|---------|--------------|
| `neverthrow` | `src/result.ts` — Result/Ok/Err/ResultAsync full implementation |
| `ts-pattern` | `src/match.ts` — exhaustive discriminated union matching |
| `zod` | `src/v4/core/parse.ts` — safeParse discriminated union, `src/v4/core/schemas.ts` — brand() |
| `openai-node` | `src/core/resource.ts` — APIResource base class, `src/core/api-promise.ts` — withResponse() |
| `ky` | `source/types.ts` — extend() pattern, hook types, KyInstance type |
| `drizzle-orm` | `src/pg-core/query-builders/select.ts` — generic type state threading |
| `kysely` | `src/query-builder/select-query-builder.ts` — join nullability in types |
| `zustand` | `src/middleware/devtools.ts` — StoreMutators module augmentation |
| `tanstack-query` | `src/types.ts` — Register pattern, discriminated state union |
