# Chat Phase 4 — Message-Level Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring chat message-level features to WhatsApp/Telegram parity: (1) **link previews** via a new SSRF-hardened Cloud Function that fetches OpenGraph tags and caches them; (2) **video-in-chat** as a new `type: 'video'` message with a client-captured poster frame; (3) **forward message** to multiple DMs/clubs at once; (4) **bulk delete-for-everyone** extending the existing inbox/message multi-select. Both DMs (`chatRooms`) and clubs (`clubs`).

**Architecture:** A new callable Cloud Function `getLinkPreview` fetches + parses OG tags server-side (client can't due to CORS) and caches results in `linkPreviews/{urlHash}`; `LinkifiedText`/`MessageBubble` render a preview card. Video uploads to **Firebase Storage** (mirroring the existing `uploadPostVideo` resumable-upload path) with a client-captured poster frame (reusing the story `capturePoster`/`readVideoMeta` technique) also stored in Firebase Storage, rendered by the existing `VideoPlayer.tsx`. Forwarding adds `forwardMessage()` to `useChatEngine` and a `ForwardModal` listing the user's conversations. Bulk delete-for-everyone extends the message-selection UI (Phase 2 `SelectionToolbar` already supports configurable actions from Phase 3) and the `deleteForEveryone` engine method to a batched multi-id variant, gated to all-own-messages.

**Tech Stack:** React 19, TypeScript, Vite, Firebase (Firestore, callable Functions v2, **Storage for video + poster**), `motion/react`, lucide-react. Functions: Node, `firebase-functions/v2/https` `onCall`, `firebase-admin`, Node built-in `fetch` (Node 20+) or `https`.

## Global Constraints

- Every task lands as its own atomic commit (standing user instruction). Do not batch.
- Work in place on `main`, `tsc --noEmit` + `vite build` green after every task; `npm --prefix tests test` green after any rules change.
- **Rules changes are DEPLOYED** after the emulator suite passes (user's standing Phase 3+ decision): `firebase deploy --only firestore:rules --project nextbench-a11ed`. **Cloud Functions are also deployed** in Task 1 (`firebase deploy --only functions:getLinkPreview`) — a new callable is inert until deployed. If CLI auth is missing, escalate to the user rather than skipping.
- **SSRF hardening is mandatory** for `getLinkPreview` (spec "Notes / risks"): reject non-`http(s)` schemes; reject private/internal/loopback/link-local IP ranges and metadata IPs; cap redirects, response size, and timeout; only parse `text/html`. This is the first outbound-fetching function in the chat path — treat it as a security boundary.
- `useChatEngine`'s public return shape may gain `forwardMessage` and a bulk delete method, but existing methods keep their signatures. `ChatViewProps` may gain optional props; the two callers (`ChatRoom.tsx`, `ClubChat.tsx`) are only touched if a task explicitly requires it.
- Reuse existing pieces: `VideoPlayer.tsx` (video render), `capturePoster`/`readVideoMeta` (extract to a shared helper — do NOT duplicate), `uploadPostVideo`'s Firebase Storage resumable-upload pattern (`storage.ts:288`), `SelectionToolbar` (configurable actions), `ConfirmDialog` (themed confirms), `MentionInput` patterns for the forward search.
- Do NOT touch `DESIGN.md`; do NOT delete the `resolve_*.py` / `ChatView-stashed.tsx` debris (Phase 6).

## Reference: current state (read once before starting)

- **`Message` type** (`useChatEngine.ts:41-57`): `type?: 'text' | 'voice'` (extend to add `'video'`), `image?: any`, `audioUrl?`, `createdAt`, `clientMessageId`, `status`. Adds needed: `video?: { url; poster?; w?; h?; duration? }`, `forwardedFrom?: { senderId; senderName }`, `linkPreview?` (optional, or resolved client-side and not persisted — see Task 2 decision).
- **`sendMessage`** (`useChatEngine.ts:261-328`): optimistic-queue pattern; `performSend` writes the message doc + room metadata via `getRoomMetadataUpdate(previewText)`. Video send will mirror `sendVoiceMessage` (`:410-438`) — a dedicated method, not shoe-horned into `sendMessage`.
- **`deleteForEveryone`** (`useChatEngine.ts:393-407`): single-id, sets `{ isDeletedForEveryone: true, text: '', image: '' }`. Bulk variant writes the same via a `writeBatch`.
- **Composer** (`src/components/chat/Composer.tsx`): image via `uploadChatImageDetailed`, `handleImageUpload` (5MB cap), `pendingImageFile`/`pendingImagePreview` state. Video attach is a sibling flow here.
- **MessageBubble** (`src/components/chat/MessageBubble.tsx`): renders image (`msg.image`), voice (`msg.type === 'voice'`), text (`LinkifiedText`). Video + link-preview + forwarded-from render here.
- **MessageContextMenu** (`src/components/chat/MessageContextMenu.tsx`): Reply/Info/Copy/Select/Delete-for-me/Delete-for-everyone/Pin. Add **Forward**.
- **Rules** (`firestore.rules`): `isValidMessage` (`:338-346`) allow-keys `text/image/sharedPost/postId/audioUrl` — must add `video`, `type`, `forwardedFrom`, `duration`, `fileSize`, `mimeType`. Message `update` for delete-for-everyone (`chatRooms :380-393`, `clubs :488-497`) is sender-only, single-doc; bulk is N single-doc writes so no rule change needed for bulk delete beyond what exists.
- **Callable pattern** (`functions/src/index.ts`): `onCall({ invoker: 'public', cors: CORS_ORIGINS }, handler)`, `assertAuthedUid(request)`, `HttpsError`. Client: `httpsCallable<Req, Res>(functions, 'name')` (see `src/lib/discovery.ts`).
- **Firebase Storage video**: `uploadPostVideo` (`storage.ts:288`) is the resumable-upload precedent (`uploadBytesResumable` → `getDownloadURL`, progress callback). Chat video/poster get their own `uploadChatVideo`/`uploadChatVideoPoster` following the same shape.

## Locked decisions (this plan)

| Question | Decision |
|----------|----------|
| Link-preview storage | Server-cached in `linkPreviews/{sha256(normalizedUrl)}` (title/description/image/siteName/fetchedAt). Client calls `getLinkPreview({ url })`; function returns cache hit or fetches+caches. The message doc stores only the URL (in its text); the preview is resolved on render, NOT persisted on the message. Keeps message writes unchanged and lets previews backfill/expire independently. |
| Link-preview trigger | `LinkifiedText` (or a wrapper in MessageBubble) detects the first URL in a text message and lazily calls `getLinkPreview`; renders a card below the text when it resolves; silent no-op on failure/timeout. One preview per message (the first URL), matching WhatsApp. |
| Video limits | Reuse story limits: max 60s, max 100MB (`storyMedia.ts` `MAX_VIDEO_MS`/`MAX_VIDEO_BYTES`). Poster captured client-side via `capturePoster`. Video + poster upload to **Firebase Storage** (`nextbench/chat_videos/…`, `nextbench/chat_video_posters/…`) via the resumable-upload pattern from `uploadPostVideo`. |
| Video message shape | `{ type: 'video', video: { url, poster, w, h, duration } }`. Rendered by `VideoPlayer` with `poster`. Inbox preview text: "📹 Video". |
| Forward semantics | New `forwardMessage(sourceMsgs, targetRoomIds)` creates one new message doc per target, copying `text`/`image`/`video` + `forwardedFrom: { senderId, senderName }` from the ORIGINAL author, respecting each target's `canPost`/membership (a forward that fails a target's rule is skipped, surfaced via toast). Voice messages are forwardable too. |
| Forward targets | Modal lists the user's DMs (from a one-time `chatRooms` query) + clubs (`useUserClubs`), multi-select, with a search filter. Reuses the conversation-row visual from `MessagesLayout`. |
| Bulk delete-for-everyone | Extends the in-chat message multi-select (the existing `isSelectMode`/`selectedMessages` in ChatView). Offered ONLY when every selected message is the current user's own (`senderId === uid`). Uses a batched `deleteForEveryoneBulk(ids)`. Themed `ConfirmDialog` replaces the native `confirm()` currently in `handleBulkDelete` (ChatView.tsx:114-126). The existing bulk delete-for-me stays. |
| SSRF | Enforced in `getLinkPreview`: scheme allowlist (http/https), DNS-resolve + reject private/loopback/link-local/CGNAT/metadata ranges (v4 + v6), `maxRedirects: 3` each re-validated, 5s timeout, 2MB body cap, `text/html` only, strip credentials in URL. |

---

### Task 1: `getLinkPreview` Cloud Function (SSRF-hardened) + deploy

**Files:**
- Create: `functions/src/linkPreview.ts`
- Modify: `functions/src/index.ts` (re-export), `firestore.rules` (read rule for `linkPreviews`)
- Create: `tests/linkPreview.rules.test.mjs`, modify `tests/package.json`

**Interfaces:**
- Callable `getLinkPreview(data: { url: string }): { title?: string; description?: string; image?: string; siteName?: string; url: string; cached: boolean } | { error: string }`.
- Cache doc `linkPreviews/{sha256hex(normalizedUrl)}`: `{ url, title, description, image, siteName, fetchedAt, status: 'ok' | 'failed' }`.

- [ ] **Step 1: Write the SSRF guard + OG parser**

`functions/src/linkPreview.ts`:
- `normalizeUrl(raw)`: trim, require `http:`/`https:` scheme (reject others), strip credentials/hash, lowercase host. Throw on invalid.
- `assertPublicHost(hostname)`: resolve via `dns.promises.lookup(hostname, { all: true })`; for each address reject loopback (`127.0.0.0/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`), link-local (`169.254/16`, `fe80::/10`), CGNAT (`100.64/10`), and cloud metadata (`169.254.169.254`). Reject if the hostname itself is an IP in those ranges.
- `fetchHtml(url)`: `fetch` with `redirect: 'manual'`, follow up to 3 redirects re-running `normalizeUrl`+`assertPublicHost` on each `Location`; `AbortController` 5s timeout; require `content-type` to include `text/html`; read at most 2MB (stream/slice); return the HTML string.
- `parseOg(html)`: regex/lightweight extraction of `og:title`/`og:description`/`og:image`/`og:site_name`, falling back to `<title>` and `<meta name=description>`. Resolve a relative `og:image` against the final URL. No external HTML-parser dependency needed (keep the parse conservative; cap field lengths: title/siteName ≤ 200, description ≤ 500, image URL ≤ 2000 and must be http(s)).

- [ ] **Step 2: The callable**

Export `getLinkPreview = onCall({ invoker: 'public', cors: CORS_ORIGINS }, handler)`:
- `assertAuthedUid(request)` (only signed-in users).
- Validate `data.url` is a string ≤ 2000 chars; `normalizeUrl`.
- Rate-limit per uid (reuse `enforceRateLimit(uid, 'link_preview', 30, 60000)` if present in index.ts; otherwise a simple check). 
- Compute `hash = sha256hex(normalizedUrl)`; read `linkPreviews/{hash}`. If a doc newer than 7 days exists, return it (`cached: true`). If a `status:'failed'` doc newer than 1 hour exists, short-circuit as failed (negative cache).
- Else `fetchHtml` + `parseOg`, write the cache doc (`fetchedAt: serverTimestamp()`), return it (`cached: false`). On fetch/SSRF failure, write a negative-cache doc and return `{ error }` (never throw raw network errors to the client).

- [ ] **Step 3: Re-export + rules**

In `functions/src/index.ts` add `export { getLinkPreview } from './linkPreview';` (or inline if the repo keeps everything in index.ts — match the existing convention; index.ts is monolithic, so define it in a new file and re-export). In `firestore.rules`, add:
```
match /linkPreviews/{hash} {
  allow get: if isSignedIn();
  allow list, write: if false;   // writes are server-side (admin) only
}
```
(Admin SDK bypasses rules, so `write:false` is correct — only the function writes.)

- [ ] **Step 4: Rules test + verify**

`tests/linkPreview.rules.test.mjs`: a signed-in user can `get` a seeded `linkPreviews/{h}` doc; client `create`/`update`/`list` all fail. Add to `tests/package.json` test script. Run `npm --prefix tests test` → all pass. `cd functions && npm run build` (tsc) → 0.

- [ ] **Step 5: Deploy the function**

`firebase deploy --only functions:getLinkPreview --project nextbench-a11ed`. Then `firebase deploy --only firestore:rules --project nextbench-a11ed`. Escalate if CLI auth missing.

- [ ] **Step 6: Commit**
```bash
git add functions/src/linkPreview.ts functions/src/index.ts firestore.rules tests/linkPreview.rules.test.mjs tests/package.json
git commit -m "feat(chat): add SSRF-hardened getLinkPreview cloud function + cache rules"
```

---

### Task 2: Link-preview card in the message list

**Files:**
- Create: `src/lib/linkPreview.ts` (client wrapper + URL detection), `src/components/chat/LinkPreviewCard.tsx`
- Modify: `src/components/chat/MessageBubble.tsx`

- [ ] **Step 1: Client wrapper**

`src/lib/linkPreview.ts`: `firstUrl(text): string | null` (reuse the URL regex from `LinkifiedText`); `getLinkPreview(url)` = `httpsCallable(functions, 'getLinkPreview')` with an in-memory `Map` cache (dedupe concurrent lookups per url within the session). Returns the preview object or null.

- [ ] **Step 2: `LinkPreviewCard`**

A presentational card: thumbnail (`og:image` via `SmartImage`, graceful when absent), siteName, title (2-line clamp), description (2-line clamp). Whole card is an `<a target="_blank" rel="noopener noreferrer">` to the URL, `onClick` stopPropagation (so it doesn't open the message context menu). Muted/bordered styling consistent with `--color-surface-elevated`.

- [ ] **Step 3: Wire into `MessageBubble`**

For a non-deleted text message, after the text, if `firstUrl(msg.text)` is non-null, render a small hook that lazily resolves the preview (a tiny `useLinkPreview(url)` hook doing `useEffect` → `getLinkPreview` → state, cancelling on unmount). Render `LinkPreviewCard` when resolved; render nothing while loading or on failure. Because bubbles are virtualized and `React.memo`, ensure the hook keys on `msg.id`+url and doesn't thrash. Do NOT block or reflow the bubble before the card resolves (the virtualizer re-measures on the height change — acceptable, same as image load).

- [ ] **Step 4: Verify** — `npm run lint` → 0, `npm run build` → 0.

- [ ] **Step 5: Manual QA** — Paste a URL (e.g. a news article) in a DM and a club → a preview card renders below the text within ~1s; tapping it opens the link; a message with no URL shows no card; a bad/blocked URL silently shows just the linkified text. Scrolling past and back re-renders without duplicate fetches (in-memory cache holds).

- [ ] **Step 6: Commit**
```bash
git add src/lib/linkPreview.ts src/components/chat/LinkPreviewCard.tsx src/components/chat/MessageBubble.tsx
git commit -m "feat(chat): render link-preview cards under messages"
```

---

### Task 3: Shared video helper + rules for video/forward message fields

**Files:**
- Create: `src/lib/chatVideo.ts` (or extract shared capture from `storyMedia.ts`)
- Modify: `firestore.rules`, `tests/clubMessages.rules.test.mjs` (extend), `src/hooks/useChatEngine.ts` (Message type only)

This task lands the data-model + rules groundwork so Tasks 4–5 are pure UI/engine.

- [ ] **Step 1: Shared video capture helper**

`storyMedia.ts` has `readVideoMeta` and `capturePoster` but they're not exported individually for reuse (verify). Export them (or move both to a new `src/lib/videoCapture.ts` that `storyMedia.ts` re-imports — do NOT duplicate the canvas logic). `chatVideo.ts` exposes `prepareChatVideo(file): Promise<{ file, posterBlob, width, height, duration }>` validating against `MAX_VIDEO_MS`/`MAX_VIDEO_BYTES`.

- [ ] **Step 2: Extend the `Message` type**

In `useChatEngine.ts`, extend `type?: 'text' | 'voice' | 'video'` and add `video?: { url: string; poster?: string; w?: number; h?: number; duration?: number }` and `forwardedFrom?: { senderId: string; senderName?: string }`. Type-only change; no logic yet.

- [ ] **Step 3: Rules — allow the new message fields**

Extend `isValidMessage` (`firestore.rules:338`) to permit `type`, `video`, `forwardedFrom`, `duration`, `fileSize`, `mimeType` keys (validate: `type in ['text','voice','video']`; `video` is a map with `url` string ≤ 2000; `forwardedFrom` is a map with `senderId` string). Keep the `hasAny(['text','image','sharedPost','postId','audioUrl','video'])` content requirement (add `video`). Apply to both DM and club message create rules (they share `isValidMessage`).

- [ ] **Step 4: Rules tests**

Extend `tests/clubMessages.rules.test.mjs` (or a new `chatVideo.rules.test.mjs`): a `{ type:'video', video:{url,poster,w,h,duration} }` message is accepted; a `video` missing `url` is rejected; a `forwardedFrom` map is accepted. Run `npm --prefix tests test` → pass.

- [ ] **Step 5: Deploy rules** — `firebase deploy --only firestore:rules --project nextbench-a11ed`.

- [ ] **Step 6: Verify + Commit** — `npm run lint` → 0, `cd functions` not needed. 
```bash
git add src/lib/chatVideo.ts src/lib/videoCapture.ts src/lib/storyMedia.ts src/hooks/useChatEngine.ts firestore.rules tests/*.mjs tests/package.json
git commit -m "feat(chat): video/forward message schema + shared video capture helper + rules"
```

---

### Task 4: Video-in-chat — send + render

**Files:**
- Modify: `src/hooks/useChatEngine.ts` (add `sendVideoMessage`), `src/lib/storage.ts` (add `uploadChatVideo`/`uploadChatVideoPoster`), `src/components/chat/Composer.tsx` (attach + preview + upload), `src/components/chat/MessageBubble.tsx` (render), `src/components/chat/ChatView.tsx` (thread `sendVideoMessage` to Composer)

- [ ] **Step 1: `sendVideoMessage` in the engine**

Mirror `sendVoiceMessage` (`useChatEngine.ts:410-438`): `sendVideoMessage(video: { url; poster?; w?; h?; duration? })` writes `{ senderId, senderName, senderAvatar, type: 'video', video, createdAt: serverTimestamp() }`, then `getRoomMetadataUpdate('📹 Video')`. Add to the hook's return object. (Optimistic handling optional; voice doesn't do it, so match voice for consistency.)

- [ ] **Step 2: Composer video attach**

Add a video `<input type="file" accept="video/*">` (or extend the existing attach to offer image|video). On select: `prepareChatVideo` (validates size/duration, captures poster); show a pending-video preview (poster thumbnail + duration + cancel), mirroring the pending-image UI. On send: upload the video to **Firebase Storage** under `nextbench/chat_videos/${roomId}/…` and the poster to `nextbench/chat_video_posters/${roomId}/…`, both via the resumable-upload helper (new `uploadChatVideo`/`uploadChatVideoPoster` in `storage.ts`, mirroring `uploadPostVideo`); then `sendVideoMessage({ url, poster, w, h, duration })`. Show an upload-progress state like the voice-upload one. Respect `isBlocked/isMember/canPost` guards exactly like image send.

- [ ] **Step 3: Render in `MessageBubble`**

Add a branch: `msg.type === 'video' && msg.video?.url` → render `<VideoPlayer src={msg.video.url} poster={msg.video.poster} />` in a width-constrained container mirroring the image bubble sizing (`w-[280px]` etc.). Keep the existing image/voice/text branches.

- [ ] **Step 4: Thread the prop** — `ChatView` passes `sendVideoMessage` to `Composer` (add to `ComposerProps`).

- [ ] **Step 5: Verify** — `npm run lint` → 0, `npm run build` → 0.

- [ ] **Step 6: Manual QA** — Attach a short video in a DM and a club → poster preview shows, upload progresses, message renders with an inline playable video (poster first, plays on tap, single-audio behavior from VideoPlayer holds). >100MB or >60s is rejected with a toast. Inbox preview shows "📹 Video". Non-poster videos still play.

- [ ] **Step 7: Commit**
```bash
git add src/hooks/useChatEngine.ts src/lib/storage.ts src/components/chat/Composer.tsx src/components/chat/MessageBubble.tsx src/components/chat/ChatView.tsx
git commit -m "feat(chat): send and render inline video messages"
```

---

### Task 5: Forward message

**Files:**
- Modify: `src/hooks/useChatEngine.ts` (add `forwardMessage`), `src/components/chat/MessageContextMenu.tsx` (Forward action), `src/components/chat/ChatView.tsx` (modal state + wiring)
- Create: `src/components/chat/ForwardModal.tsx`

- [ ] **Step 1: `forwardMessage` in the engine**

`forwardMessage(sourceMsgs: Message[], targets: { collection: 'chatRooms'|'clubs'; roomId: string }[]): Promise<{ ok: number; failed: number }>`. For each target × each source message, build a new message doc copying `text`/`image`/`video`/`audioUrl`/`type` and setting `forwardedFrom: { senderId: src.senderId, senderName: src.senderName }`, `senderId: currentUser.uid`, `createdAt: serverTimestamp()`. Write with `addDoc` to the target's messages subcollection and update that room's metadata. Wrap each target write in try/catch so a rule rejection (e.g. non-poster club) counts as `failed` without aborting the batch. This is NOT tied to the mounted room's `collectionPath` — it writes to arbitrary targets (the user must be a member/participant of each, enforced by rules).

- [ ] **Step 2: `ForwardModal`**

Lists the user's DMs (one-time `getDocs(query(chatRooms, where participants array-contains uid))` resolving other-user names) + clubs (`useUserClubs`), searchable, multi-select (checkbox rows reusing the conversation-row look). A "Forward to N" button calls `forwardMessage(sources, selectedTargets)` and toasts the `{ok, failed}` result. Close on success.

- [ ] **Step 3: Wire Forward into the context menu + ChatView**

Add a **Forward** button to `MessageContextMenu` (below Reply/Info). It sets a `forwardingMsgIds` state in ChatView (single message from the menu; also works from multi-select — a Forward action in the selection toolbar can reuse it). ChatView renders `ForwardModal` when `forwardingMsgIds` is non-empty, passing the resolved source `Message[]` and `forwardMessage`.

- [ ] **Step 4: Verify** — `npm run lint` → 0, `npm run build` → 0.

- [ ] **Step 5: Manual QA** — Long-press/open a message → Forward → pick 2 conversations (a DM + a club) → both receive the message with a "Forwarded" label; forwarding to a leads-only club where you're not a lead is skipped and the toast reports the partial failure. Forward an image, a video, and a voice message. Forwarded copies show `forwardedFrom` attribution.

- [ ] **Step 6: Commit**
```bash
git add src/hooks/useChatEngine.ts src/components/chat/MessageContextMenu.tsx src/components/chat/ForwardModal.tsx src/components/chat/ChatView.tsx
git commit -m "feat(chat): forward messages to multiple conversations"
```

---

### Task 6: Bulk delete-for-everyone

**Files:**
- Modify: `src/hooks/useChatEngine.ts` (add `deleteForEveryoneBulk`), `src/components/chat/ChatView.tsx` (selection toolbar action + confirm dialog)

- [ ] **Step 1: `deleteForEveryoneBulk` in the engine**

`deleteForEveryoneBulk(ids: string[])`: a `writeBatch` setting `{ isDeletedForEveryone: true, text: '', image: '' }` on each `messages/{id}` (chunk at 450/batch like `clubs.ts` deleteClub). Only the sender's own messages will pass the rules; the caller gates the UI so all ids are own-messages. Add to the return object.

- [ ] **Step 2: Selection toolbar — offer delete-for-everyone when all-own**

In ChatView, the in-chat message multi-select (`isSelectMode`/`selectedMessages`) currently only bulk-deletes-for-me via native `confirm()` (`handleBulkDelete`, `ChatView.tsx:114-126`). Replace the native `confirm()` with `ConfirmDialog`. When every selected message is own (`messages.filter(id∈sel).every(m => m.senderId === uid)`), show a second action / dialog option "Delete for everyone" that calls `deleteForEveryoneBulk`. Keep "Delete for me" for mixed selections. Wire the selection toolbar (already `SelectionToolbar` from Phase 2/3) with the two actions.

- [ ] **Step 3: Verify** — `npm run lint` → 0, `npm run build` → 0.

- [ ] **Step 4: Manual QA** — Select multiple of your own messages → the bar offers "Delete for everyone" → themed dialog confirms → all become "This message was deleted" for all members. Select a mix of own + others' → only "Delete for me" is offered. Emulator/live: deleting-for-everyone another user's message is rejected by rules (UI shouldn't offer it, but the write fails safely if attempted).

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useChatEngine.ts src/components/chat/ChatView.tsx
git commit -m "feat(chat): bulk delete-for-everyone for own messages"
```

---

### Task 7: Final Phase 4 verification

**Files:** none (verification only unless a fix is needed).

- [ ] **Step 1:** `npm run lint` → 0.
- [ ] **Step 2:** `npm run build` → 0.
- [ ] **Step 3:** `cd functions && npm run build` → 0 (functions typecheck).
- [ ] **Step 4:** `npm --prefix tests test` → all pass (prior suites + Task 1/3 additions).
- [ ] **Step 5:** Confirm deploys landed: `getLinkPreview` function live, rules deployed.
- [ ] **Step 6: Milestone manual QA** (spec Phase 4 milestone): paste a URL → preview card; send a video → plays inline; forward a message to 2 conversations at once; bulk-delete-for-everyone a multi-select of own messages. Re-run in both a DM and a club.
- [ ] **Step 7: If any check fails** — do not close Phase 4; file the failure as a new task, fix under its own commit, re-run Steps 1–6.

---

## Notes for the executor

- **SSRF is the highest-risk item** — the `assertPublicHost` DNS check must run on the FINAL resolved address after each redirect, not just the initial URL (DNS-rebinding / redirect-to-internal). Re-validate on every hop.
- **Preview not persisted on messages** — keeps message-doc writes and rules unchanged; the card resolves from the cache collection on render. If a future phase wants offline previews, that's a separate persistence decision.
- **Video poster reuse** — `capturePoster`/`readVideoMeta` already exist in `storyMedia.ts`; extract, don't duplicate (the stories tests may cover them — keep those green).
- **Forward writes to arbitrary rooms** — `forwardMessage` is the one engine method that writes outside the mounted room; each write is still rules-gated (membership/canPost), so a malicious target is server-rejected. Count rejections as `failed`, never crash.
- **Bulk delete-for-everyone gating is UI-only convenience** — the rules already enforce sender-only delete-for-everyone; the UI just avoids offering an action that would fail.
- **Deploy discipline** — functions AND rules are deployed this phase (user decision). Run the emulator suite BEFORE deploying rules; build functions BEFORE deploying the function.
- After each task, let `tsc --noEmit` (via `npm run lint`) flag unused imports under `noUnusedLocals` and remove exactly those.
