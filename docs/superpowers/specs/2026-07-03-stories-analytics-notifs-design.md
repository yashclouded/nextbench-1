# Stories — Phase 4: Owner Analytics, Notifications & Perf

**Status:** Approved · **Date:** 2026-07-03 · Final phase. Builds on Phases 1–3.

Owner-facing analytics in the viewer, a "first story after inactivity" notification, and a
small perf hardening pass. Consumes Phase 1 APIs (`getStoryViewers`, `getStoryViewCount`,
`deleteStory`) and existing app conventions (notifications collection, `getPublicUsers`).

## Locked decisions
| Area | Decision |
|------|----------|
| Notifications | Cloud Function on `stories/{id}` create. **First story after a ≥3-day gap** (or first ever) → one **in-app** notification per **follower**; blocked users skipped; no push. The gap itself is the anti-spam guard (bursts don't re-notify). |
| Owner tools | On your OWN story the viewer shows **"Seen by N"** → a viewers sheet (avatar, name, time) **and** a **delete** action. |
| Perf | Short session cache of the tray so remounting the feed is instant; quiet background refresh. |

## Owner analytics UI
- `StoryOwnerBar.tsx` — shown at the bottom of the viewer only when
  `entry.authorId === currentUid`. Fetches `getStoryViewCount(storyId)` → "Seen by N".
  Trash button with a small inline confirm → delete.
- `StoryViewersSheet.tsx` — bottom sheet; on open fetches `getStoryViewers(storyId)` then
  `getPublicUsers(viewerIds)` to resolve avatars/names; lists each with a relative time.
- Viewer integration: opening the sheet **pauses** playback; the owner bar/sheet
  `stopPropagation` so taps don't drive navigation. Delete → `deleteStory(storyId)` →
  close viewer → `refetch` tray (via `Stories.tsx`).

## Notifications — `notifyOnFirstStory`
`onDocumentCreated('stories/{storyId}')`:
1. Read `authorId`, `createdAt`.
2. Query the author's **previous** story: `where authorId == author, where createdAt <
   this.createdAt, orderBy createdAt desc, limit 1` (uses the existing
   `stories(authorId ASC, createdAt DESC)` index). If a previous story exists and the gap
   `< 3 days` → **return** (recently active, no spam).
3. Otherwise fetch followers (`follows where followingId == author`), skip any with a block
   relationship, and batch-write in-app `notifications` docs
   `{ userId: follower, type: 'story_posted', title, message: "<name> just posted a story.",
   link: '/community', read: false, createdAt }`.
Batched at ≤450 writes. Follower counts are small (<150), so no cap needed.

## Perf hardening
- `useStories`: a module-level `Map<uid, { tray, ts }>` (TTL ~60s). On mount, if fresh,
  seed `tray` immediately (no spinner) and still refetch quietly to refresh. `refetch` and
  `markSeenLocal` keep the cache in sync.

## Testing & verification
`tsc --noEmit`, `vite build`, `functions` build; rerun Phase 1 rules tests + Phase 2/3 unit
tests for regressions. Notification/analytics paths are Firestore/DOM-bound → verified
manually (seed stories, view as another user, check "Seen by N"; post after a 3-day gap for
the notification).

## Out of scope (still future, schema already reserves)
Reactions, replies, polls, question/GIF/location stickers, mentions, hashtags, highlights,
close-friends membership + UI, archives UI, resharing, and FCM push for story notifications.
