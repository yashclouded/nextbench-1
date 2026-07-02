# Stories — Phase 2: Row + Immersive Viewer

**Status:** Approved · **Date:** 2026-07-02 · Builds on Phase 1 foundation.

The consumption (read) experience: a horizontally scrollable stories row at the top of the
feed, and a full-screen immersive viewer with Instagram-style gestures, timing, and
animation. Consumes `src/lib/stories.ts` directly. **No creation** (Phase 3) beyond a
stubbed "add" entry point.

## 1. Locked decisions
| Area | Decision |
|------|----------|
| Viewer presentation | Full-screen **overlay** via `AnimatePresence`, rendered through a `body` portal. Opening **pushes a history entry** so browser / Android hardware back closes the viewer (not the feed). No shareable permalink → "no access by URL after expiry" stays a non-issue. |
| Gestures/animation | **Motion (framer-motion v12) only** — drag/pan + pointer events. No new dependency. |
| Add-story slot | Row starts with the current user's avatar + `+`; tap calls a **stubbed hook** (toast) that Phase 3 wires to the editor. |
| Row placement | **Below** the sticky header tabs in `Feed.tsx`, above the window-virtualized list (scrolls away with content). |
| Video sound | Autoplay **with sound** (the open-tap is the user gesture); if the browser rejects `play()`, fall back to **muted autoplay + tap-to-unmute**. |

## 2. Component architecture (`src/components/stories/`)
| File | Responsibility | Depends on |
|------|----------------|-----------|
| `StoriesRow.tsx` | Horizontal scroll row; add slot; `onOpenAuthor(index)`. | `useStoriesTray`, `StoryAvatar` |
| `StoryAvatar.tsx` | One bubble: ring (unseen gradient / seen gray), avatar, username; `add` variant. | `getOptimizedImageUrl` |
| `StoryViewer.tsx` | Overlay orchestrator: portal, history lifecycle, gesture surface, author/story cursor, preload, view/seen writes, keyboard, scroll lock. | `storyNavigation`, `stories.ts`, sub-components |
| `StoryProgressBars.tsx` | Segmented bars (one per current author's story); animates active segment; pause-aware. | Motion |
| `StoryContent.tsx` | One story: media (img/`<video>`), author header (avatar, username, "2h ago"), close button, layers overlay. | `StoryLayerRenderer` |
| `StoryLayerRenderer.tsx` | Renders normalized layers over the story box. **Shared with Phase 3 editor.** | — |
| `src/lib/useStories.ts` | `useStoriesTray()` → `{ tray, loading, refetch, markSeenLocal }`. | `stories.ts`, `useFollowingIds`, `useAuth` |
| `src/lib/storyNavigation.ts` | **Pure** advance/prev/jump over `(authorIndex, storyIndex)`. Unit-tested. | — |

Each unit is understandable and (where logic-bearing) testable in isolation. The two pieces
Phase 3 reuses — `StoryLayerRenderer` and `storyNavigation` — are built here.

## 3. Data flow
`useStoriesTray()` calls `getStoriesTray(uid, followingIds)` (via existing `useFollowingIds()`),
one-shot on mount, exposes `refetch`. Ring state updates **optimistically** through
`markSeenLocal(authorId)` when a user is viewed, so the row greys the ring on close with no
refetch. Fetch failure fails quietly (row renders nothing but the add slot) — matches
`follows.ts` error handling.

## 4. Viewer interaction model (Motion + pointer events)
- **Cursor**: `(authorIndex, storyIndex)` into the ordered tray. All transitions go through
  pure `storyNavigation` helpers:
  - `advance(cursor, tray)` → next story; past an author's last → next author's first;
    past the last author → `{ done: true }` (close).
  - `rewind(cursor, tray)` → previous story; before an author's first → previous author's
    **last**; before the first author → clamp (stay).
  - `jumpAuthor(cursor, tray, dir)` → prev/next author, story 0.
- **Tap zones**: invisible left-third (`rewind`) / right-third (`advance`) hit areas.
- **Press & hold** (pointerdown ≥ 200 ms) → pause: freeze progress tween + `video.pause()`;
  release → resume.
- **Swipe down**: Motion `drag="y"` on the card; release past ~120 px or high velocity →
  close; else spring back.
- **Swipe left/right**: horizontal drag past threshold → `jumpAuthor` with a slide
  transition.
- **Timing**: images auto-advance after `story.durationMs ?? IMAGE_DEFAULT_DURATION_MS`
  (5 s); videos advance on `ended`, progress driven by `timeupdate` / `duration`. The active
  progress segment is a Motion tween keyed by `authorIndex:storyIndex` so it resets cleanly.
- **Views/seen**: after ~800 ms dwell on a story → `recordStoryView(storyId, uid, authorId)`;
  on leaving an author's set (or closing) → `markAuthorSeen(uid, authorId, latestId,
  latestCreatedAt)` + `markSeenLocal`. All wrapped in catch-and-ignore (non-blocking).
- **Close**: pop the pushed history entry; `AnimatePresence` exit (fade + scale/translate).

## 5. Layer rendering contract
Layers are normalized (0–1) to the **rendered 9:16 story box** (shared by the Phase 3
editor). `StoryLayerRenderer` receives the box's measured `{ width, height }` and positions
each layer absolutely: `left = x·W`, `top = y·H`, transform `translate(-50%,-50%)
rotate(rotation) scale(scale)`, text `fontSize = fontSize·W`. Media fills the box with
`object-fit: cover`. Text layers honor `color`, `backgroundColor` (pill), `align`,
`fontFamily`.

## 6. Performance
- Preload the **next 1–2** stories' media (`new Image()` for images; a hidden
  `<link rel="preload" as="video">` / `preload="auto"` for the immediate-next video).
- Keep a small in-memory `Set` of decoded media URLs to avoid re-thrashing on back/forward.
- Row avatars `loading="lazy"`.
- Viewer mounts only when open; media for non-adjacent stories is not created.

## 7. Feed integration
Mount `<StoriesRow onOpenAuthor={openAt} />` directly below the sticky header-tabs block in
`Feed.tsx`. It's a normal block above the window-virtualized list; the existing
`feedListOffset` measurement (reads the list element's `rect.top`) absorbs the added height,
so virtualization positioning stays correct. `<StoryViewer />` renders via `createPortal` at
`document.body` when `openAuthorIndex != null`, escaping the feed's stacking/overflow.

## 8. Error handling
- Tray fetch error → quiet (log, render add slot only).
- Media load error → `StoryContent` shows a neutral fallback + auto-advances after a short
  delay so a broken story can't wedge the viewer.
- `recordStoryView` / `markAuthorSeen` errors → caught and ignored.
- Empty tray or `openAuthorIndex` out of range → viewer no-ops / closes.

## 9. Testing & verification
No component-test runner exists in-repo, so:
- **Unit-test the pure `storyNavigation`** (advance/rewind across story & author boundaries,
  close-at-end, clamp-at-start, jump wrap) via `tests/` + `node --test`.
- `tsc --noEmit` + `vite build` gate the components.
- Manual QA seeded by `scripts/seed-stories.mjs`.

## 10. Out of scope (Phase 2)
Creation/editor/upload (Phase 3; `+` is stubbed), reactions/replies/polls/stickers, owner
viewer-list UI (Phase 4), notifications, resharing. `StoryLayerRenderer` + `storyNavigation`
are built now for Phase 3 reuse.
