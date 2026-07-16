# Chat Phase 5 — Realtime Social Layer (Typing + Read Receipts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add live typing indicators and read receipts to DMs and clubs. Typing is a debounced map field on the room doc; read receipts are a `readBy: uid[]` array on each message, batched into the existing throttled `markAsRead`. Includes DM ticks (sent→delivered→read), club "seen by" info, field-scoped Firestore rules (deployed), and folds in a regression fix (delete-for-me messages aren't currently filtered out of the view).

**Architecture:** `useChatEngine` gains (a) a room-doc `onSnapshot` to read `typingUsers`, (b) a debounced `setTyping(isTyping)` writer, and (c) a `markVisibleRead(messageIds)` writer batched into the 2s throttle window. `Composer` calls `setTyping` on input/blur/send. `ChatHeader` renders the DM/club typing line. `MessageList` derives the visible message ids from the virtualizer and feeds them to the read-receipt writer. `MessageBubble` renders DM ticks and the club single-check. Rules add field-scoped `readBy` (any member) and `typingUsers` (self-only) update branches.

**Tech Stack:** React 19, TS, Vite, Firebase Firestore (`onSnapshot`, `arrayUnion`, field-scoped rules), motion/react, lucide-react.

## Global Constraints
- Atomic commit per task (standing instruction). `tsc` + `vite build` green each task; `npm --prefix tests test` green after rules changes.
- **Rules DEPLOYED** after emulator suite passes (`firebase deploy --only firestore:rules --project nextbench-a11ed`), consistent with Phases 3–4.
- **Write-volume discipline (spec risk note):** typing writes MUST be debounced (~2s, only on transition to typing + a stop-write on blur/send), and read-receipt writes MUST be batched into the existing 2s `markAsRead` throttle — never per-keystroke, never per-message. A busy club is the worst case.
- Reuse: existing `markAsRead` throttle in `MessageList.tsx:150`, the virtualizer visible-range in `MessageList.tsx`, `ChatHeader` presence line, `MessageBubble` `isMe`/status branches. Do NOT add a second room-doc listener in ChatRoom/ClubChat — the engine owns it.
- `ChatViewProps` may gain optional props; callers touched only if required.

## Reference: current state
- **`markAsRead`** (`useChatEngine.ts:132`): reads room doc, `arrayRemove(uid)` from `unreadBy` if present. 2s-throttled by `MessageList.tsx:150-157` gated on `isNearBottom`.
- **Message live listener** (`useChatEngine.ts:157+`): `docChanges()` into a Map; `setMessages(sortedFromMap(...))`. **No room-doc listener exists** — must add one for `typingUsers`.
- **`Message`** has `deletedFor?: string[]` (written by `deleteForMe:385`) but **nothing filters it out of the view** — regression from the Phase 1 rewrite (the old code filtered `deletedFor.includes(uid)`; ours doesn't). Fold the fix in Task 0.
- **Rules:** DM message update (`firestore.rules:393`) allows `deletedFor` / sender-only body / `reactions`. Club message update (`:498`) allows `deletedFor` / `reactions` / sender-only body. Room-doc updates: chatRooms `:376`, clubs member branch `:457` + per-user-state `:463`.
- **ChatHeader** (`ChatHeader.tsx:77`): DM shows presence "Active Now"/label; club shows `subtitle` (member count).
- **Composer** (`Composer.tsx`): `newMessage` state + `MentionInput`; `handleSendMessage` clears input.
- **DM presence** already exists (`src/lib/presence.ts` `useUserPresence`) — typing overrides it in the header when active.

## Locked decisions
| Question | Decision |
|---|---|
| Typing storage | `typingUsers: { [uid]: Timestamp }` map on the room/club doc. Write server timestamp on transition-to-typing and re-arm every ~2s while typing; clear own key (`deleteField` via dot-path) on blur/send. Readers treat entries older than 5s as stale (no timeout write needed). |
| Typing write cadence | Debounced: fire a write at most once per 2s while actively typing; a stop-write on blur/send/empty input. Never per-keystroke. |
| Read receipts storage | `readBy: uid[]` on each message doc, `arrayUnion(uid)`. |
| Read receipts cadence | Batched into the existing 2s `markAsRead` throttle: on each throttle tick, arrayUnion the viewer's uid onto the currently-visible, not-own, not-already-read messages in ONE `writeBatch` (capped at ~50/window). Derived from the virtualizer's visible range. |
| DM ticks | On own messages: `status==='pending'` → spinner (existing); single check = sent (message exists on server); double check (brand-teal) = `readBy` contains the recipient (read). **No separate gray "delivered" state** (user decision — Sent + Read only, zero extra writes). |
| Club receipts | On own messages: a single check when `readBy` has ≥1 member other than me ("seen by at least one"). The Message Info modal (already exists) resolves + lists `readBy` names. No per-member inline ticks. |
| Typing display | DM: "typing…" replaces the presence line while active. Club: "X is typing" / "X and Y are typing" / "Several people are typing" (resolve names from `clubMembers` + a light name cache). |
| Rules — readBy | Any room member may update ONLY `readBy` via `arrayUnion(self)` — add a branch using `affectedKeys().hasOnly(['readBy'])`. |
| Rules — typingUsers | Any room member may update ONLY `typingUsers` on the ROOM doc, and only their own key — add a room-doc branch `hasOnly(['typingUsers'])` (element-level self-only check is hard in rules; accept member-scoped like `unreadBy`, matching existing lenient precedent). |
| deletedFor filter | Filter messages where `deletedFor?.includes(uid)` out of the Map projection (Task 0). |

---

### Task 0: Fix delete-for-me filtering (regression fold-in)
**Files:** `src/hooks/useChatEngine.ts`

- [ ] **Step 1:** In the message projection (`sortedFromMap` usage / the Map→array step feeding `setMessages`), exclude messages where `deletedFor?.includes(user.uid)`. Simplest: filter in `sortedFromMap` call sites, or add the check where docs enter the Map (skip adding own-deleted). Prefer filtering at projection time (a message can become deleted-for-me via a 'modified' change, so keep it in the Map but hide it in the view) — mirror the reactions/soft-delete pattern.
- [ ] **Step 2:** Verify `deleteForMe` now hides the message locally within one snapshot; `deleteForEveryone` still shows the "deleted" tombstone (that path is `isDeletedForEveryone`, unaffected).
- [ ] **Step 3:** `npm run lint` → 0, `npm run build` → 0.
- [ ] **Step 4: Commit** `fix(chat): hide messages deleted-for-me from the message list`

---

### Task 1: Rules — field-scoped readBy + typingUsers (+ tests + deploy)
**Files:** `firestore.rules`, `tests/readReceipts.rules.test.mjs` (new), `tests/package.json`

- [ ] **Step 1: Message `readBy`** — In BOTH the DM message update rule (`:393`) and club message update rule (`:498`), add an OR branch: `incoming().diff(existing()).affectedKeys().hasOnly(['readBy'])` gated on room membership (any member/participant, NOT sender-only). This is the read-receipt write.
- [ ] **Step 2: Room `typingUsers`** — chatRooms room-doc update (`:376`): add `'typingUsers'` to the `hasOnly([...])` allow-list (participants already gated by `canAccessRoom`). Clubs: add a member OR branch `hasOnly(['typingUsers'])` next to the per-user-state branch (`:463`), or add `'typingUsers'` to the existing member preview branch key list. Keep `updatedAt`-unchanged discipline for clubs (typing must not reorder the inbox).
- [ ] **Step 3: Add `readBy`/`typingUsers` to `isValidMessage`?** — `readBy` is on the message doc but only written via update (not create), so `isValidMessage` (create) doesn't need it; confirm create still passes when `readBy` absent. `typingUsers` is room-level, not message-level.
- [ ] **Step 4: Tests** — `tests/readReceipts.rules.test.mjs`: member can arrayUnion self into a message's `readBy`; non-member cannot; a readBy write that also touches `text` fails; participant can set `typingUsers` on the room doc without bumping other fields; typing write that also changes `unreadBy` fails (hasOnly guard). Add to `tests/package.json`.
- [ ] **Step 5:** `npm --prefix tests test` → all pass. `firebase deploy --only firestore:rules --project nextbench-a11ed`.
- [ ] **Step 6: Commit** `feat(chat): field-scoped readBy + typingUsers rules + tests`

---

### Task 2: Engine — typing read/write + room-doc listener
**Files:** `src/hooks/useChatEngine.ts`

- [ ] **Step 1: Room-doc listener** — add an `onSnapshot(doc(db, collectionPath, roomId))` effect (same enable/deps as the message listener) that stores `typingUsers` map in state. Expose `typingUsers` (raw map) from the hook.
- [ ] **Step 2: `setTyping(isTyping)` writer** — debounced: keep a ref of the last typing-write time; when `isTyping` and >2s since last write, `updateDoc(roomRef, { [\`typingUsers.\${uid}\`]: serverTimestamp() })`. On `isTyping===false` (blur/send/empty), `updateDoc(roomRef, { [\`typingUsers.\${uid}\`]: deleteField() })`. Guard: never write for non-members/blocked. Expose `setTyping`.
- [ ] **Step 3: Derive active typers** — expose a helper or computed `typingUserIds` = keys of `typingUsers` whose Timestamp is within 5s of now AND ≠ current uid. (Compute in the consumer to keep it fresh, or expose raw map + a `staleMs` const.)
- [ ] **Step 4:** Add `typingUsers`, `setTyping` to the hook's return. `tsc` 0.
- [ ] **Step 5: Commit** `feat(chat): typing-indicator read/write in chat engine`

---

### Task 3: Composer emits typing + ChatHeader renders it
**Files:** `src/components/chat/Composer.tsx`, `src/components/chat/ChatHeader.tsx`, `src/components/chat/ChatView.tsx`

- [ ] **Step 1: Composer** — accept `setTyping` prop. On `MentionInput` change with non-empty value, call `setTyping(true)` (debounce lives in the engine); on blur, on send, and when the field goes empty, call `setTyping(false)`. Clear typing on unmount.
- [ ] **Step 2: ChatView** — thread `setTyping` to Composer and `typingUserIds`/`typingUsers` to ChatHeader (resolve 5s-fresh, non-self ids; for clubs pass `clubMembers` for name resolution).
- [ ] **Step 3: ChatHeader** — when typers exist: DM shows "typing…" (teal, replaces presence line). Club shows "X is typing" / "X and Y are typing" / "Several people are typing" (resolve names via a small getDoc cache like `ClubSenderName`, or accept ids and show "Someone is typing" if unresolved). Three-dot pulse styling per the visual addendum (brand-teal).
- [ ] **Step 4:** `tsc` 0, build 0.
- [ ] **Step 5: Manual QA (2 accounts):** typing on one client shows on the other within ~2s and clears within ~5s of stopping / on send. DM and club.
- [ ] **Step 6: Commit** `feat(chat): live typing indicators in composer + header`

---

### Task 4: Read receipts — engine writer + visible-range wiring
**Files:** `src/hooks/useChatEngine.ts`, `src/components/chat/MessageList.tsx`

- [ ] **Step 1: `markVisibleRead(ids)` writer** — in the engine, a `writeBatch` that `arrayUnion(uid)` onto `readBy` for each id that (a) isn't own (`senderId !== uid`) and (b) doesn't already contain uid. Cap ~50/call. Expose it.
- [ ] **Step 2: MessageList visible range** — from `rowVirtualizer.getVirtualItems()`, map the visible `renderItems` of kind 'message' to their message ids. In the existing 2s throttle tick (`:150`), in addition to `markAsRead()`, call `markVisibleRead(visibleMessageIds)`. Keep it gated so it doesn't fire while scrolling rapidly beyond the throttle.
- [ ] **Step 3:** Ensure `readBy` rides in via 'modified' docChanges (it will — it's a field update) and doesn't churn unrelated bubbles (only the changed message gets a new Map ref). `tsc` 0, build 0.
- [ ] **Step 4: Commit** `feat(chat): batched read-receipt writes for visible messages`

---

### Task 5: Ticks UI (DM) + club seen-by
**Files:** `src/components/chat/MessageBubble.tsx`, `src/components/chat/MessageContextMenu.tsx` (Info modal)

- [ ] **Step 1: DM ticks** — on own, non-deleted messages in a DM: render a tick cluster bottom-right. `status==='pending'` → spinner (existing); otherwise single check (sent) by default; `readBy` includes `recipientId` → double check brand-teal (read). No gray "delivered" state (user decision). Needs `recipientId` in MessageBubble props (thread from MessageList→ChatView, or derive from the other participant). Use lucide `Check`/`CheckCheck`.
- [ ] **Step 2: Club single-check** — on own club messages: a single brand-teal check when `readBy` has ≥1 id ≠ me.
- [ ] **Step 3: Info modal seen-by** — in the Message Info modal (`MessageContextMenu`), for own messages resolve `readBy` uids → names (getDoc cache) and list them ("Seen by Alice, Bob"). DM: show Read/Delivered state text.
- [ ] **Step 4:** `tsc` 0, build 0.
- [ ] **Step 5: Manual QA (2 accounts):** send a DM → recipient views → sender's tick flips to teal double-check. Club → own message shows single check after another member views; Info lists names.
- [ ] **Step 6: Commit** `feat(chat): read-receipt ticks (DM) and club seen-by`

---

### Task 6: Final Phase 5 verification
- [ ] `npm run lint` → 0; `npm run build` → 0; `npm --prefix tests test` → all pass.
- [ ] Confirm rules deployed.
- [ ] Milestone (2 accounts, DM + club): typing shows ≤2s / clears ≤5s; read flips on view; club seen-by resolves names. Watch write volume in the Firestore console isn't pathological while idle-typing.
- [ ] If any check fails, file a follow-up task, fix under its own commit, re-run.

## Notes for the executor
- **Write volume is the headline risk.** Verify in the console that an idle chat produces ZERO writes and active typing produces ≤1 write/2s/user. Read receipts ≤1 batch/2s while viewing.
- **Stale typing needs no cleanup write** — readers filter by 5s freshness; a client that closes mid-typing leaves a key that simply ages out.
- **No second room listener** — the engine's new room-doc `onSnapshot` is the single source; ChatRoom/ClubChat keep their own metadata listeners for title/avatar (separate concern) but must not also write typing.
- **readBy churn:** because bubbles are `React.memo`, a `readBy` update re-renders only that bubble; confirm with the Phase 2 profiler discipline.
- Deploy rules only after the emulator suite passes.
