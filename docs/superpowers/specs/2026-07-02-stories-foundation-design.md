# Stories — Phase 1: Foundation & Data Model

**Status:** Approved · **Date:** 2026-07-02 · **Owner:** Stories feature

Phase 1 of the Instagram-style Stories feature. This phase builds **only the backend
foundation**: the Firestore data model, storage layout, security rules, expiration
semantics, an extensible overlay schema, the client library surface that later phases
consume, and the supporting Cloud Function / index / tests. **No UI** ships in this phase.

Later phases (separate specs): Phase 2 = stories row + immersive viewer; Phase 3 =
creation + editor + upload; Phase 4 = owner analytics UI + notifications + polish.

---

## 1. Locked decisions

| Area | Decision |
|------|----------|
| Tray read | Direct client Firestore query, chunked `in` on `authorId` (following < 150). No fan-out. Matches the recent migration off Cloud-Function reads. |
| Media storage | Firebase Storage for **both** image and video. Client-side image compression + client-captured video poster frame (no ffmpeg). |
| Expiry | **Keep forever.** "Active" ≡ `status == 'active' && createdAt > now − 24h`. No deletion job. Expired stories remain the owner's permanent archive (seeds future Archives/Highlights). |
| Visibility | Per-story `privacy` field, default `'public'`, mirroring the existing posts model (`isPublicStory` ≈ `isPublicPost`). Reserve `'followers'` / `'closeFriends'` tiers, enforced via a deterministic follow-edge doc. |

## 2. Firestore data model

### `stories/{storyId}` (top-level)
```
authorId: string                     // == request.auth.uid at create
authorUsername: string               // denormalized → tray renders with zero extra reads
authorPhotoURL: string | null        // denormalized
mediaType: 'image' | 'video'
mediaUrl: string                     // Firebase Storage download URL
mediaPath: string                    // Storage object path (for rules/cleanup/deletion)
posterUrl?: string | null            // video thumbnail (client-captured frame)
posterPath?: string | null
width: number                        // intrinsic media width  (for correct render/letterbox)
height: number                       // intrinsic media height
durationMs?: number                  // video only; images fall back to a client default (~5000)
layers: Layer[]                      // structured overlays — see §3
privacy: 'public' | 'followers' | 'closeFriends'   // default 'public'
status: 'active' | 'removed'         // moderation / user soft-delete
createdAt: Timestamp                 // == request.time at create
expiresAt: Timestamp                 // == createdAt + 24h (stored for readability; not the source of truth for "active")
```
`expiresAt` is denormalized convenience. Because it is a constant offset from `createdAt`,
all "active" filtering uses `createdAt > now − 24h` (single-field range → simple index).

### `stories/{storyId}/views/{viewerId}` (subcollection)
Doc ID **is** the viewer's uid ⇒ natural once-per-viewer dedup.
```
firstViewedAt: Timestamp
lastViewedAt: Timestamp
```
Read: **story owner only**. Total views computed via Firestore `count()` aggregation on
demand (no counter, no drift, no function). `viewCount` denormalization is reserved for a
future live badge but not written in this phase.

### `users/{uid}/private/storySeen` (single doc)
```
seen: { [authorId: string]: { lastSeenAt: Timestamp, lastSeenStoryId: string } }
```
One read yields ring state for the entire tray. Owner-only read/write. Map stays tiny for
< 150 authors (well under the 1 MiB doc ceiling).

### `follow_edges/{followerId}_{followingId}` (top-level, deterministic)
```
followerId: string
followingId: string
createdAt: Timestamp
```
Mirrors the `blocks` id convention so security rules can `exists()`-check a follow
relationship (auto-ID `follows` docs cannot be path-looked-up). **Maintained by a Cloud
Function trigger** on `follows` create/delete, so no existing follow write-site is touched.
Client-writable: never (only the admin-SDK function writes it).

### Reserved for later phases (documented, not created now)
- `stories/{id}/reactions/{uid}`, `stories/{id}/replies/{replyId}` — reactions/replies.
- `story_highlights/{highlightId}` — highlights referencing kept-forever stories.
- Archives need **no** new collection: they are a query over the owner's own stories with
  no `createdAt` window.

## 3. Extensible overlay schema
Overlays are structured data rendered dynamically at view time — never baked into the
media. A discriminated union lets future sticker types slot in with **zero migration**.
```ts
interface LayerBase {
  id: string;
  type: string;      // discriminator
  x: number;         // NORMALIZED 0..1, center-x relative to media box → resolution-independent
  y: number;         // NORMALIZED 0..1, center-y
  rotation: number;  // degrees
  scale: number;     // multiplier
  z: number;         // stacking order
}
interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  fontFamily: string;                 // from a client allowlist
  color: string;                      // hex/rgba
  backgroundColor?: string | null;    // pill/highlight behind text
  align: 'left' | 'center' | 'right';
  fontSize: number;                   // fraction of render width (resolution-independent)
}
type Layer = TextLayer; // widens as sticker types are added: PollLayer | QuestionLayer | ...
```
Normalized coordinates + fractional font size mean the same stored data renders correctly
at any viewport / device pixel ratio.

## 4. Views & ring state
- **Record a view** after a short on-screen dwell (~800 ms). Writes `views/{viewerId}`
  (create first time, update `lastViewedAt` on rewatch). Owner self-views are **not**
  recorded (rule-enforced) and never count.
- **Total views**: `count()` aggregation over the `views` subcollection when the owner
  opens their own story.
- **Ring state**: a user has *unseen* stories from author A iff A's newest active
  `createdAt` > `storySeen[A].lastSeenAt`. The viewer writes `storySeen` as they watch.

## 5. Security rules
New helpers (reuse existing `hasBlockRelationship`, `isSignedIn`, `isVerified`, `isValidId`):
- `storyDoc(id)`, `followEdgeDoc(follower, following)`
- `isActiveStory(d)` = `d.status == 'active' && d.createdAt > request.time - duration.value(24, 'h')`
- `isPublicStory(d)` = `d.get('privacy', 'public') == 'public'`
- `canViewStory(d)` = signed-in && `!hasBlockRelationship(uid, d.authorId)` && (
  `uid == d.authorId`  *(owner sees own, incl. expired archive)*
  **or** ( `isActiveStory(d)` && ( `isPublicStory(d)`
  **or** ( `d.privacy in ['followers','closeFriends']` && `exists(followEdgeDoc(uid, d.authorId))` ) ) ) )

**`stories/{storyId}`**
- `get` / `list`: `canViewStory(resource.data)`. The tray query is scoped to
  `authorId in {self + followees}`, so every matched doc passes. Public docs short-circuit
  before any `exists()` call, keeping `list` within Firestore's per-query document-access
  limit. *Known limitation:* enabling the followers/closeFriends tier at scale needs
  per-author queries to stay under that limit — flagged for Phase 2+.
- `create`: `isVerified()`, `isValidId(storyId)`, `authorId == uid`, `mediaType in ['image','video']`,
  `privacy in [...]`, `status == 'active'`, `createdAt == request.time`,
  `expiresAt == request.time + duration.value(24,'h')`, `layers is list && layers.size() <= 30`,
  bounded string/number fields.
- `update`: owner only; may change `status`, `privacy`, `layers` (bounded); immutable
  `authorId`/`createdAt`/`mediaPath`.
- `delete`: owner or admin.

**`stories/{storyId}/views/{viewerId}`**
- `create`/`update`: `viewerId == uid`, `uid != story.authorId`, `canViewStory(story)`,
  timestamp integrity.
- `get`: story owner or the viewer themselves. `list`: story owner only.

**`follow_edges/{id}`**: read by the two parties; **write: never** (admin-SDK only).

**`users/{userId}/private/{docId}`**: read/write only when `uid == userId`.

**Storage** — `stories/{authorId}/{storyId}/{file}`:
- `write`: `uid == authorId`, size cap (image ≤ 15 MB, video ≤ 100 MB), content-type
  `image/*` or `video/*`.
- `read`: any signed-in user. Discovery is gated by the Firestore doc; the token URL is
  unguessable. *Known limitation:* for private tiers this is view-by-URL-if-you-hold-it;
  stricter signed-URL enforcement is a documented future option.

## 6. Client library surface — `src/lib/stories.ts`
Single source of truth for types **and** the API Phases 2 & 3 consume. Mirrors existing
`src/lib` conventions (module functions + `db`/`storage` from `./firebase`).

```ts
// Types
export interface Story { /* §2 */ }
export type Layer = TextLayer;         // §3
export interface TextLayer { /* §3 */ }
export interface TrayEntry {
  authorId: string; username: string; photoURL: string | null;
  stories: Story[]; hasUnseen: boolean; latestCreatedAt: number;
}
export interface StoryViewer { viewerId: string; firstViewedAt: Date; lastViewedAt: Date; }

// Read
export function getStoriesTray(currentUid: string, followingIds: string[]): Promise<TrayEntry[]>;
export function getUserActiveStories(authorId: string): Promise<Story[]>;
export function getSeenState(uid: string): Promise<Record<string, { lastSeenAt: number; lastSeenStoryId: string }>>;

// Write
export function createStory(input: CreateStoryInput): Promise<Story>;
export function deleteStory(storyId: string): Promise<void>;
export function setStoryStatus(storyId: string, status: 'active' | 'removed'): Promise<void>;
export function recordStoryView(storyId: string): Promise<void>;
export function markAuthorSeen(uid: string, authorId: string, latestStoryId: string, latestCreatedAt: Date): Promise<void>;

// Owner analytics
export function getStoryViewers(storyId: string): Promise<StoryViewer[]>;
export function getStoryViewCount(storyId: string): Promise<number>;   // count() aggregation

// Constants shared with later phases
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const IMAGE_DEFAULT_DURATION_MS = 5000;
export const MAX_LAYERS = 30;
```
`getStoriesTray` groups by author, computes ring state from `getSeenState`, and orders:
self → unseen by recency → seen by recency. (Close Friends ordering is a future insert
point.) Following-list chunking uses `in` batches ≤ 10.

## 7. Ancillary deliverables
- **Index**: `stories(authorId ASC, createdAt DESC)` added to `firestore.indexes.json`.
  `status` filtered client-side to keep the index minimal.
- **Cloud Function**: `mirrorFollowEdge` — `onDocumentCreated` + `onDocumentDeleted` on
  `follows/{followId}`, writing/removing `follow_edges/{followerId}_{followingId}`
  (delete only when no other follow doc for the pair remains). Node 20 TS, appended to
  `functions/src/index.ts`.
- **Backfill**: `scripts/backfill-follow-edges.mjs` (ADC auth, mirrors existing script
  conventions) to populate edges for pre-existing follows.
- **Storage rules**: new `storage.rules` + `storage` block in `firebase.json`.
  ⚠️ Since Storage rules were previously console-managed, the file includes the existing
  app paths (`nextbench/**` read-any-signed-in, owner-scoped writes) so adopting
  repo-managed rules does not break current uploads. **Deploy only after confirming parity
  with the console ruleset.**
- **Tests**: `@firebase/rules-unit-testing` suite on the emulator covering active vs
  expired visibility, public vs followers, block exclusion, owner archive access, view
  dedup, owner-only viewer list, and self-view rejection.
- **Seed**: `scripts/seed-stories.mjs` to populate demo stories for Phase 2 QA.

## 8. Out of scope (this phase)
Any UI (row/viewer/editor), notifications, and the *implementation* of compression /
poster capture (Phase 3 — foundation only fixes the storage contract, size limits, and
paths). Reactions, polls, stickers, highlights, close-friends UI, resharing — all reserved
via the schema but not built.

## 9. Testing strategy
Emulator-based rules unit tests (above) are the primary safety net for the security model.
App + functions typecheck (`npm run lint`, `functions && npm run build`) gate the code.
The seed script enables manual end-to-end verification once Phase 2 renders the tray.
