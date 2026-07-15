# Chat Phase 2 — Extract Components & Re-virtualize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 1207-line `src/components/chat/ChatView.tsx` into six focused components and reintroduce virtualization so a 500+ message thread scrolls without dropped frames or scroll-jump, while preserving current behavior exactly.

**Architecture:** `ChatView.tsx` becomes a thin orchestrator that owns the `useChatEngine` hook and all cross-component UI state, and composes `ChatHeader`, `MessageList` (which renders `MessageBubble` rows), `MessageContextMenu`, `Composer`, and `SelectionToolbar`. Only `ChatView` talks to `useChatEngine`; every other piece takes plain props and callbacks. `MessageList` owns the scroll viewport and everything scroll-driven (load-older trigger, scroll-to-bottom, jump FAB, near-bottom `markAsRead` throttle, day dividers, session unread divider) and uses `@tanstack/react-virtual`'s `useVirtualizer` with `measureElement` for dynamic per-bubble height correction.

**Tech Stack:** React 19, TypeScript, Vite, `motion/react`, `@tanstack/react-virtual` (^3.14.4, already installed), Tailwind, lucide-react.

## Global Constraints

- Every task lands as its own atomic commit (standing user instruction) — do not batch multiple tasks into one commit.
- **`ChatViewProps` must not change.** The two callers — `src/pages/Dashboard/ClubChat.tsx` and `src/pages/Dashboard/ChatRoom.tsx` — pass `ChatView` the exact prop set defined at `ChatView.tsx:62-85`. This is an internal refactor: those two files are NOT modified by any task in this plan. If a task appears to require changing a caller, stop and escalate.
- This repo has NO component/hook test harness for React/TS code, and adding one is explicitly out of scope (`docs/superpowers/specs/2026-07-14-chat-overhaul-design.md`, "Testing & verification"). For every task here the verification step is `npm run lint` (= `tsc --noEmit`) plus `npm run build` plus the task's manual-QA checklist. Do NOT write component unit tests.
- Behavior-preserving: extraction tasks (1–6) must produce byte-identical rendered output and identical interaction behavior. The only intended visual change in the whole plan is Task 4's header background (backdrop-blur → solid) and Tasks 8–9's new dividers.
- Run `npm run lint` and `npm run build` from the repo root: `/Users/yashsingh/nextbench-1`.
- Do NOT touch `DESIGN.md`. Do NOT delete `ChatView-stashed.tsx` or the `resolve_*.py` debris — that cleanup is Phase 6, out of scope here.
- New components live in `src/components/chat/`. Reused presentational pieces the spec calls shared (`SelectionToolbar`) also live there for now; Phase 3 will decide if it moves to `src/components/ui/`.
- The `Message` type and the `useChatEngine` hook API are fixed (defined in `src/hooks/useChatEngine.ts`); no task changes them.

---

## Reference: current state (read once before starting)

**`ChatViewProps` (ChatView.tsx:62-85)** — unchanged by this plan:
```ts
interface ChatViewProps {
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  title: string;
  subtitle?: string;
  avatar?: string | null;
  isBlocked?: boolean;
  isMember?: boolean;
  isAdmin?: boolean;
  canPost?: boolean;
  clubMembers?: string[];
  otherUser?: any;
  otherPresence?: any;
  onBack?: () => void;
  showOptions?: boolean;
  setShowOptions?: (show: boolean) => void;
  showReport?: boolean;
  setShowReport?: (show: boolean) => void;
  recipientId?: string;
  pinnedMessageText?: string | null;
  onUnpin?: () => void;
  onPin?: (msgId: string, text?: string) => void;
}
```

**`Message` (useChatEngine.ts)** — fixed:
```ts
export interface Message {
  id: string; senderId: string; senderName?: string; senderAvatar?: string | null;
  text?: string; image?: any; type?: 'text' | 'voice'; audioUrl?: string; duration?: number;
  fileSize?: number; mimeType?: string; createdAt: any; replyToId?: string | null;
  replyToText?: string | null; deletedFor?: string[]; isDeletedForEveryone?: boolean;
  reactions?: Record<string, string[]>; clientMessageId?: string;
  status?: 'pending' | 'failed' | 'sent';
}
```

**`useChatEngine` returns:** `{ messages, loading, hasMore, loadOlder, sendMessage, resendMessage, removeFailedMessage, deleteForMe, deleteForEveryone, sendVoiceMessage, markAsRead }`.

**Target file structure after this plan:**
- `ChatView.tsx` — thin orchestrator: owns `useChatEngine`, `useVoiceRecorder`, all state, renders the 6 children. Keeps the pinned-message banner inline (small, orchestrator-level).
- `ChatHeader.tsx` — top bar: back button, avatar+title (clickable→navigate), presence/subtitle, overflow "Options" button; renders `SelectionToolbar` in select mode. Solid background (no blur).
- `MessageList.tsx` — scroll viewport: empty state, loading skeleton, virtualized rows, day dividers, session unread divider, load-older trigger, scroll-anchor-on-prepend, scroll-to-bottom-on-new, jump-to-bottom FAB, throttled near-bottom `markAsRead`.
- `MessageBubble.tsx` — the current `MessageItem` `React.memo` component + `ClubSenderAvatar` + `ClubSenderName` helpers.
- `MessageContextMenu.tsx` — the floating action menu overlay + the two delete-confirm dialogs + the Message Info modal.
- `Composer.tsx` — footer: reply-preview bar, quick-replies carousel, pending-image preview, voice-recording/uploading/error states, the send form (attach, mention input, mic, send).
- `SelectionToolbar.tsx` — presentational bulk-action bar (count + delete + cancel), reusable by Phase 3/4.

---

### Task 1: Extract `MessageBubble.tsx`

**Files:**
- Create: `src/components/chat/MessageBubble.tsx`
- Modify: `src/components/chat/ChatView.tsx` (remove `MessageItem`, `ClubSenderAvatar`, `ClubSenderName`; import from new file)

**Interfaces:**
- Consumes: `Message` from `../../hooks/useChatEngine`.
- Produces: `export const MessageBubble` — a `React.memo` component with the exact prop object currently declared for `MessageItem` at `ChatView.tsx:1020-1042`. Also `export` nothing else (the two helpers stay module-private inside `MessageBubble.tsx`).

Prop interface (identical to current `MessageItem`, name the type `MessageBubbleProps`):
```ts
interface MessageBubbleProps {
  msg: Message;
  user: any;
  isSelectMode: boolean;
  isSelected: boolean;
  toggleMessageSelection: (msgId: string) => void;
  activeReactionMsgId: string | null;
  setActiveReactionMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedMessageId: string | null;
  setSelectedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setMenuPosition: React.Dispatch<React.SetStateAction<{ top?: number; bottom?: number; left?: number; right?: number } | null>>;
  replyingTo: Message | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  setDeleteConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  setDeleteEveryoneConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  onPin?: (msgId: string, text?: string) => void;
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  showLightbox: (urls: string[]) => void;
  resendMessage: (tempId: string) => void;
  removeFailedMessage: (tempId: string) => void;
  isAdmin: boolean;
}
```

- [ ] **Step 1: Create `MessageBubble.tsx` by moving the three components verbatim**

Create `src/components/chat/MessageBubble.tsx`. Move, verbatim from `ChatView.tsx`:
- `ClubSenderAvatar` (lines 937-966)
- `ClubSenderName` (lines 968-996)
- the `MessageItem` `React.memo` component (lines 997-1207), renamed to `MessageBubble`, with its prop type extracted to the named `MessageBubbleProps` interface above.

Add the file's imports (a subset of ChatView's current imports — include exactly what these three components reference):
```tsx
import React, { useState, useEffect } from 'react';
import { X, SmilePlus, CheckCircle2, Circle, RefreshCw, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Avatar from '../ui/Avatar';
import SmartImage from '../ui/SmartImage';
import VoiceMessageBubble from '../ui/VoiceMessageBubble';
import MessageReactions from '../ui/MessageReactions';
import LinkifiedText from '../ui/LinkifiedText';
import { Message } from '../../hooks/useChatEngine';
```
Export it: `export const MessageBubble = React.memo(function MessageBubble({ ... }: MessageBubbleProps) { ... });`

- [ ] **Step 2: Update `ChatView.tsx` to import and use it**

Delete lines 937-1207 (the three moved components) from `ChatView.tsx`. Add near the other component imports (after line 51):
```tsx
import { MessageBubble } from './MessageBubble';
```
In the message map (currently `ChatView.tsx:529-554`), rename the JSX element `<MessageItem` → `<MessageBubble` (props unchanged). Remove any now-unused imports from `ChatView.tsx` that were only used by the moved code — after deletion, run Step 3; tsc will name any that are now unused (the project has `noUnusedLocals`). Likely newly-unused in ChatView: none of the top-level icons are safe to blindly remove, so let tsc report them and remove exactly those it flags.

- [ ] **Step 3: Verify types compile and build**

Run: `npm run lint`
Expected: exits 0. If it reports unused imports in `ChatView.tsx`, remove exactly those and re-run until clean.

Run: `npm run build`
Expected: exits 0, `dist/` produced.

- [ ] **Step 4: Manual QA**

`npm run dev`. Open a DM and a club chat. Confirm: text/image/voice bubbles render identically; club sender name+avatar still appear for others' messages and are clickable to the profile; reactions, reply-preview, pending spinner, failed-retry buttons all unchanged; clicking a bubble still opens the context menu at the correct anchor.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageBubble.tsx src/components/chat/ChatView.tsx
git commit -m "refactor(chat): extract MessageBubble from ChatView"
```

---

### Task 2: Extract `MessageContextMenu.tsx`

**Files:**
- Create: `src/components/chat/MessageContextMenu.tsx`
- Modify: `src/components/chat/ChatView.tsx`

**Interfaces:**
- Consumes: `Message` from `../../hooks/useChatEngine`.
- Produces: `export function MessageContextMenu(props: MessageContextMenuProps)` — renders the floating action menu overlay, the two delete-confirm dialogs, and the Message Info modal. It reads the target message from the passed `messages` array by id (mirrors current inline logic at `ChatView.tsx:587` and `:899`).

```ts
interface MessageContextMenuProps {
  messages: Message[];
  user: any;
  isClub: boolean;
  isAdmin: boolean;
  onPin?: (msgId: string, text?: string) => void;
  // menu anchor state (owned by ChatView)
  selectedMessageId: string | null;
  setSelectedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  menuPosition: { top?: number; bottom?: number; left?: number; right?: number } | null;
  // action targets
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>;
  toggleMessageSelection: (msgId: string) => void;
  msgInfoId: string | null;
  setMsgInfoId: React.Dispatch<React.SetStateAction<string | null>>;
  deleteConfirmMsgId: string | null;
  setDeleteConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  deleteEveryoneConfirmMsgId: string | null;
  setDeleteEveryoneConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  deleteForMe: (id: string) => Promise<void> | void;
  deleteForEveryone: (id: string) => Promise<void> | void;
  onCopyText: (text: string) => void;
}
```

- [ ] **Step 1: Create `MessageContextMenu.tsx` by moving three JSX blocks verbatim**

Create the file with imports:
```tsx
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Reply, Info, Trash2, Pin, CheckCircle2 } from 'lucide-react';
import { Message } from '../../hooks/useChatEngine';
```
Move, verbatim (adjusting the closures to use props instead of ChatView's local state/handlers):
- The context-menu overlay `AnimatePresence` block (`ChatView.tsx:575-670`). Its `handleCopyMessageText(targetMsg.text!)` call becomes `onCopyText(targetMsg.text!)`.
- The two delete-confirm dialogs (`ChatView.tsx:840-876`) — the `deleteForMe`/`deleteForEveryone` calls come from props.
- The Message Info modal (`ChatView.tsx:879-931`). Its `isClub` ternary uses the `isClub` prop.

Wrap all three in a single returned fragment inside one `<AnimatePresence>` (the dialogs are currently inside the composer footer's `<AnimatePresence>` at 839-932 — moving them out into this component's own `<AnimatePresence>` preserves their enter/exit animation identically).

- [ ] **Step 2: Wire into `ChatView.tsx`**

Remove the moved JSX from `ChatView.tsx` (the overlay block 575-670, and the dialog/modal block 839-932 — leaving the composer footer `<div>` at 673 intact and its own content). Keep `handleCopyMessageText` (ChatView.tsx:405-408) in ChatView and pass it as `onCopyText`. Keep all the driving state (`selectedMessageId`, `menuPosition`, `msgInfoId`, `deleteConfirmMsgId`, `deleteEveryoneConfirmMsgId`, `isSelectMode`, `selectedMessages`) in ChatView. Render, just before the closing `</div>` of the root (after the composer footer):
```tsx
<MessageContextMenu
  messages={messages}
  user={user}
  isClub={isClub}
  isAdmin={isAdmin}
  onPin={onPin}
  selectedMessageId={selectedMessageId}
  setSelectedMessageId={setSelectedMessageId}
  menuPosition={menuPosition}
  setReplyingTo={setReplyingTo}
  setIsSelectMode={setIsSelectMode}
  toggleMessageSelection={toggleMessageSelection}
  msgInfoId={msgInfoId}
  setMsgInfoId={setMsgInfoId}
  deleteConfirmMsgId={deleteConfirmMsgId}
  setDeleteConfirmMsgId={setDeleteConfirmMsgId}
  deleteEveryoneConfirmMsgId={deleteEveryoneConfirmMsgId}
  setDeleteEveryoneConfirmMsgId={setDeleteEveryoneConfirmMsgId}
  deleteForMe={deleteForMe}
  deleteForEveryone={deleteForEveryone}
  onCopyText={handleCopyMessageText}
/>
```
Add import: `import { MessageContextMenu } from './MessageContextMenu';`

- [ ] **Step 3: Verify**

Run: `npm run lint` → 0 (remove ChatView imports tsc now flags as unused: likely `Reply`, `Info`, `CheckCircle2` if no longer referenced there).
Run: `npm run build` → 0.

- [ ] **Step 4: Manual QA**

Open a message's menu: Reply, Info, Copy text, Select messages, Delete for me, Delete for everyone (only for own/admin), Pin (only when `onPin` present) all behave identically. The delete-for-me and delete-for-everyone confirm dialogs open, cancel, and confirm correctly. The Message Info modal shows Sent-at and Status with the club/DM wording unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageContextMenu.tsx src/components/chat/ChatView.tsx
git commit -m "refactor(chat): extract MessageContextMenu and message dialogs from ChatView"
```

---

### Task 3: Extract `SelectionToolbar.tsx`

**Files:**
- Create: `src/components/chat/SelectionToolbar.tsx`
- Modify: `src/components/chat/ChatView.tsx`

**Interfaces:**
- Produces: `export function SelectionToolbar(props: SelectionToolbarProps)` — a presentational bulk-action bar. Phase 3/4 will reuse it, so keep it prop-driven and free of chat-specific logic.

```ts
interface SelectionToolbarProps {
  count: number;          // number of selected items
  onDelete: () => void;   // bulk delete handler
  onCancel: () => void;   // exit select mode
}
```

- [ ] **Step 1: Create the component**

`src/components/chat/SelectionToolbar.tsx`:
```tsx
import { Trash2 } from 'lucide-react';

interface SelectionToolbarProps {
  count: number;
  onDelete: () => void;
  onCancel: () => void;
}

export function SelectionToolbar({ count, onDelete, onCancel }: SelectionToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onDelete} disabled={count === 0} className="p-2 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 rounded-full" title="Delete selected">
        <Trash2 size={18} />
      </button>
      <button onClick={onCancel} className="text-xs font-bold text-luxury-ink/50 hover:text-luxury-ink px-3 py-1.5 rounded-full hover:bg-surface-soft transition-all">
        Cancel
      </button>
    </div>
  );
}
```
This is the exact markup currently at `ChatView.tsx:460-467` (the select-mode branch of the header actions), with `selectedMessages.size` → `count`, `handleBulkDelete` → `onDelete`, and the cancel closure → `onCancel`.

- [ ] **Step 2: Use it in ChatView's header (temporary — moves into ChatHeader in Task 4)**

In `ChatView.tsx`, replace the inline select-mode markup (lines 460-467) with:
```tsx
<SelectionToolbar
  count={selectedMessages.size}
  onDelete={handleBulkDelete}
  onCancel={() => { setIsSelectMode(false); setSelectedMessages(new Set()); }}
/>
```
Add import: `import { SelectionToolbar } from './SelectionToolbar';`

- [ ] **Step 3: Verify**

Run: `npm run lint` → 0. Run: `npm run build` → 0.

- [ ] **Step 4: Manual QA**

Enter select mode (via a message's "Select messages"). Confirm the delete button is disabled at 0 selected, enabled after selecting, deletes on click, and Cancel exits select mode and clears the selection — identical to before.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/SelectionToolbar.tsx src/components/chat/ChatView.tsx
git commit -m "refactor(chat): extract reusable SelectionToolbar"
```

---

### Task 4: Extract `ChatHeader.tsx` (+ mobile-perf background swap)

**Files:**
- Create: `src/components/chat/ChatHeader.tsx`
- Modify: `src/components/chat/ChatView.tsx`

**Interfaces:**
- Consumes: `SelectionToolbar` from `./SelectionToolbar`.
- Produces: `export function ChatHeader(props: ChatHeaderProps)`.

```ts
interface ChatHeaderProps {
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  title: string;
  subtitle?: string;
  avatar?: string | null;
  otherUser?: any;
  otherPresence?: any;
  recipientId?: string;
  onBack?: () => void;
  showOptions?: boolean;
  setShowOptions?: (show: boolean) => void;
  isSelectMode: boolean;
  selectedCount: number;
  onBulkDelete: () => void;
  onCancelSelect: () => void;
}
```

- [ ] **Step 1: Create the component**

`src/components/chat/ChatHeader.tsx`. Move the header `<div>` block verbatim from `ChatView.tsx:413-478`, with these substitutions:
- It needs `useNavigate` (the avatar/title click navigates). Import `import { useNavigate } from 'react-router-dom';` and call `const navigate = useNavigate();` inside.
- Imports: `import { ChevronLeft, ShieldCheck, MoreVertical } from 'lucide-react';` and `import Avatar from '../ui/Avatar';` and `import { SelectionToolbar } from './SelectionToolbar';`
- The select-mode branch (currently the `<SelectionToolbar .../>` after Task 3) uses the props: `<SelectionToolbar count={selectedCount} onDelete={onBulkDelete} onCancel={onCancelSelect} />`.
- **Mobile-perf change (spec-mandated):** on the outermost header `<div>`, replace the class `bg-surface-base/80 backdrop-blur-md` with `border-b` already present + an explicit solid background and border. Final className:
  ```tsx
  className="px-6 py-4 border-b border-luxury-ink/5 flex items-center justify-between z-30 shrink-0"
  ```
  and add an inline style for the solid elevated surface:
  ```tsx
  style={{ backgroundColor: 'var(--color-surface-elevated)' }}
  ```
  (Removes the `backdrop-blur-md` GPU cost on Android WebView; `--color-surface-elevated` is defined in `src/index.css` for both themes. No functional change.)

- [ ] **Step 2: Wire into ChatView**

Replace `ChatView.tsx:413-478` with:
```tsx
<ChatHeader
  collectionPath={collectionPath}
  roomId={roomId}
  title={title}
  subtitle={subtitle}
  avatar={avatar}
  otherUser={otherUser}
  otherPresence={otherPresence}
  recipientId={recipientId}
  onBack={onBack}
  showOptions={showOptions}
  setShowOptions={setShowOptions}
  isSelectMode={isSelectMode}
  selectedCount={selectedMessages.size}
  onBulkDelete={handleBulkDelete}
  onCancelSelect={() => { setIsSelectMode(false); setSelectedMessages(new Set()); }}
/>
```
Add import: `import { ChatHeader } from './ChatHeader';`. Remove the now-unused `SelectionToolbar` import from ChatView (it now lives in ChatHeader) and any header-only icons tsc flags (`ChevronLeft`, `ShieldCheck`, `MoreVertical`, and possibly `Avatar` if unused elsewhere in ChatView).

- [ ] **Step 3: Verify**

Run: `npm run lint` → 0. Run: `npm run build` → 0.

- [ ] **Step 4: Manual QA**

Header renders identically in DM (presence label, verified badge) and club (subtitle). Back button, avatar/title click-to-navigate, and the Options toggle all work. In select mode the header shows the SelectionToolbar. Visually confirm the header background is now solid (no translucency/blur) in both light and dark themes and that content scrolling under it is fully occluded.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatHeader.tsx src/components/chat/ChatView.tsx
git commit -m "refactor(chat): extract ChatHeader and replace header blur with solid surface"
```

---

### Task 5: Extract `Composer.tsx`

**Files:**
- Create: `src/components/chat/Composer.tsx`
- Modify: `src/components/chat/ChatView.tsx`

**Interfaces:**
- Consumes: `Message`, `useVoiceRecorder`, the voice/image upload helpers.
- Produces: `export function Composer(props: ComposerProps)`. To keep the extraction behavior-identical and low-risk, the Composer owns the input/upload/voice UI state that is *only* used by the footer, while `sendMessage`/`sendVoiceMessage` and reply state stay owned by ChatView (reply state is shared with the context menu and bubbles).

```ts
interface ComposerProps {
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  isBlocked: boolean;
  isMember: boolean;
  canPost: boolean;
  user: any;
  userData: any;
  replyingTo: Message | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  sendMessage: (text?: string, image?: any, replyTo?: Message | null) => void;
  sendVoiceMessage: (url: string, durationSec: number, size: number, mime: string) => Promise<void> | void;
}
```

- [ ] **Step 1: Create the component**

Create `src/components/chat/Composer.tsx`. Move into it, verbatim, from ChatView:
- Local state used only by the footer: `newMessage`, `showQuickReplies`, `isUploading`, `pendingImageFile`, `pendingImagePreview`, `voiceUploading`, `voiceUploadProgress`, `voiceUploadError` (ChatView.tsx:118-120, 128-129, 133, 137-138).
- The refs `fileInputRef`, `formRef` (ChatView.tsx:140-141).
- The `useVoiceRecorder()` hook call and destructure (ChatView.tsx:182-191).
- Handlers: `handleStartRecording`, `handleStopRecording`, `handleCancelRecording` (263-282), the voice-processing `useEffect` (285-312), `handleSendMessage` (315-353), `handleInputKeyDown` (356-361), `handleImageUpload` (363-373), `clearPendingImage` (375-379).
- The `QUICK_MESSAGES` constant (53-60).
- The footer JSX: the entire `<div className="p-4 border-t ...">` composer block (ChatView.tsx:673-836) EXCEPT the delete dialogs/info modal (those went to MessageContextMenu in Task 2 — by now they are already removed from this block).

Note: `handleSendMessage` calls `notifyMentionedUsers` and clears `newMessage`/`replyingTo`/`showQuickReplies`. The clear was previously done via the hook's `onMessageSent` callback (`handleMessageSentCallback`, ChatView.tsx:152-156). Since `newMessage`/`showQuickReplies` now live in Composer, Composer clears them directly in `handleSendMessage` after calling `sendMessage`, and calls `setReplyingTo(null)` (prop) for the shared reply state. **Remove** the `onMessageSent`/`handleMessageSentCallback` wiring from ChatView's `useChatEngine` call in Step 2 (it becomes redundant; quick-reply sends and voice sends also clear locally). Composer imports:
```tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Camera, Zap, Mic, CornerDownRight } from 'lucide-react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { stopAllVoicePlayback } from '../../hooks/useVoicePlayer';
import { uploadChatImageDetailed } from '../../lib/storage';
import { uploadVoiceMessage } from '../../lib/voiceMessage';
import { notifyMentionedUsers } from '../../lib/mentions';
import { useToast } from '../../lib/ToastContext';
import MentionInput from '../ui/MentionInput';
import VoiceRecordingControls from '../ui/VoiceRecordingControls';
import { Message } from '../../hooks/useChatEngine';
```

- [ ] **Step 2: Wire into ChatView**

Delete all the moved state/refs/handlers/JSX/constant from ChatView. Replace the footer block with:
```tsx
<Composer
  collectionPath={collectionPath}
  roomId={roomId}
  isBlocked={isBlocked}
  isMember={isMember}
  canPost={canPost}
  user={user}
  userData={userData}
  replyingTo={replyingTo}
  setReplyingTo={setReplyingTo}
  sendMessage={sendMessage}
  sendVoiceMessage={sendVoiceMessage}
/>
```
Add import `import { Composer } from './Composer';`. Remove ChatView's now-unused imports (tsc will flag: `Send`, `Camera`, `Zap`, `Mic`, `CornerDownRight`, `VoiceRecordingControls`, `MentionInput`, `useVoiceRecorder`, `uploadChatImageDetailed`, `uploadVoiceMessage`, `notifyMentionedUsers`, `stopAllVoicePlayback`, and the `QUICK_MESSAGES` const). Remove `handleMessageSentCallback` and drop `onMessageSent` from the `useChatEngine({...})` call.

- [ ] **Step 3: Verify**

Run: `npm run lint` → 0. Run: `npm run build` → 0.

- [ ] **Step 4: Manual QA**

Full composer parity: type + send (Enter and Send button), attach image (>5MB rejected, preview shows, caption sends, clear works), quick replies (DM only) send on tap, voice record → stop → upload progress → send, voice error → retry/dismiss, reply-preview bar shows and clears, all disabled states (blocked / non-member / non-poster) show the correct placeholder and disable the controls. Sending clears the input, reply, and quick-replies exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/Composer.tsx src/components/chat/ChatView.tsx
git commit -m "refactor(chat): extract Composer from ChatView"
```

---

### Task 6: Extract `MessageList.tsx` (ChatView becomes thin orchestrator)

**Files:**
- Create: `src/components/chat/MessageList.tsx`
- Modify: `src/components/chat/ChatView.tsx`

**Interfaces:**
- Consumes: `MessageBubble` from `./MessageBubble`, `Message` from `../../hooks/useChatEngine`.
- Produces: `export function MessageList(props: MessageListProps)` — owns the scroll viewport and all scroll-driven behavior (load-older trigger, scroll-anchor-on-prepend, scroll-to-bottom-on-new, jump FAB, and the throttled near-bottom `markAsRead`).

```ts
interface MessageListProps {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  loadOlder: () => void;
  markAsRead: () => void;
  user: any;
  isClub: boolean;
  isMember: boolean;
  isAdmin: boolean;
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  onPin?: (msgId: string, text?: string) => void;
  showLightbox: (urls: string[]) => void;
  resendMessage: (tempId: string) => void;
  removeFailedMessage: (tempId: string) => void;
  // context-menu + selection wiring (state owned by ChatView)
  isSelectMode: boolean;
  selectedMessages: Set<string>;
  toggleMessageSelection: (msgId: string) => void;
  activeReactionMsgId: string | null;
  setActiveReactionMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedMessageId: string | null;
  setSelectedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setMenuPosition: React.Dispatch<React.SetStateAction<{ top?: number; bottom?: number; left?: number; right?: number } | null>>;
  replyingTo: Message | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  setDeleteConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  setDeleteEveryoneConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
}
```

- [ ] **Step 1: Create the component**

Create `src/components/chat/MessageList.tsx`. Move into it from ChatView:
- Scroll refs: `parentRef`, `prevScrollHeightRef`, `prevScrollTopRef`, `lastMarkAsReadRef`, `lastMsgIdRef`, `lastMessagesLengthRef` (ChatView.tsx:142-144, 148, 150, 234).
- Scroll state: `isNearBottom`, `newMessageCount` (145-146).
- The throttled markAsRead `useEffect` (193-200) — now inside MessageList, using the `markAsRead` prop.
- `handleScroll` (205-220), the scroll-anchor-on-history `useEffect` (223-231), the scroll-to-bottom-on-new `useEffect` (233-261).
- The scroll viewport JSX (`ChatView.tsx:496-556`): the `<div ref={parentRef} onScroll={handleScroll} ...>` including the empty-state block (501-515), loading skeleton (517-525), and the message map (528-555, rendering `<MessageBubble .../>`).
- The jump-to-bottom FAB (558-572).

Imports:
```tsx
import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { Message } from '../../hooks/useChatEngine';
```
Root element of MessageList is a fragment containing the scroll `<div>` and the FAB (the FAB is `absolute` and currently a sibling of the scroll div inside ChatView's root; keep it a sibling by returning `<>...</>`). The empty-state `isClub && !isMember` branch uses the `isClub`/`isMember` props.

- [ ] **Step 2: Wire into ChatView — the thin orchestrator emerges**

Remove all moved refs/state/effects/JSX from ChatView. Replace the scroll-area + FAB region with:
```tsx
<MessageList
  messages={messages}
  loading={loading}
  hasMore={hasMore}
  loadOlder={loadOlder}
  markAsRead={markAsRead}
  user={user}
  isClub={isClub}
  isMember={isMember}
  isAdmin={isAdmin}
  collectionPath={collectionPath}
  roomId={roomId}
  onPin={onPin}
  showLightbox={showLightbox}
  resendMessage={resendMessage}
  removeFailedMessage={removeFailedMessage}
  isSelectMode={isSelectMode}
  selectedMessages={selectedMessages}
  toggleMessageSelection={toggleMessageSelection}
  activeReactionMsgId={activeReactionMsgId}
  setActiveReactionMsgId={setActiveReactionMsgId}
  selectedMessageId={selectedMessageId}
  setSelectedMessageId={setSelectedMessageId}
  setMenuPosition={setMenuPosition}
  replyingTo={replyingTo}
  setReplyingTo={setReplyingTo}
  setDeleteConfirmMsgId={setDeleteConfirmMsgId}
  setDeleteEveryoneConfirmMsgId={setDeleteEveryoneConfirmMsgId}
/>
```
Add import `import { MessageList } from './MessageList';`. Remove ChatView's now-unused imports (tsc flags: `ArrowDown`, `MessageBubble` — now indirect). After this task ChatView owns only: the `useAuth`/`useToast`/`useLightbox` hooks, `isClub`/`canLoadMessages`, the shared UI state (`selectedMessageId`, `menuPosition`, `replyingTo`, `isSelectMode`, `selectedMessages`, `deleteConfirmMsgId`, `deleteEveryoneConfirmMsgId`, `msgInfoId`, `activeReactionMsgId`), `toggleMessageSelection`, `handleBulkDelete`, `handleCopyMessageText`, the `useChatEngine` call, the pinned banner JSX, and the composition of the 5 children + context menu.

- [ ] **Step 3: Verify**

Run: `npm run lint` → 0. Run: `npm run build` → 0. Confirm `ChatView.tsx` is now under ~200 lines (`wc -l src/components/chat/ChatView.tsx`).

- [ ] **Step 4: Manual QA**

Scroll parity: load-older triggers near top and preserves scroll anchor (no jump); new message from the other user while scrolled up increments the FAB count; FAB scrolls to bottom; sending your own message scrolls to bottom; near-bottom marks the room read (verify the club inbox unread state clears, and — regression check from Phase 1 — that reading does NOT reorder the inbox). Empty state and loading skeleton render correctly.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx src/components/chat/ChatView.tsx
git commit -m "refactor(chat): extract MessageList; ChatView is now a thin orchestrator"
```

---

### Task 7: Virtualize `MessageList` with `useVirtualizer` + `measureElement`

**Files:**
- Modify: `src/components/chat/MessageList.tsx`

**Interfaces:** unchanged (`MessageListProps` stays as Task 6 defined).

**Why the stashed attempt failed (do not repeat):** `ChatView-stashed.tsx` used `estimateSize: () => 64` with `overscan: 10` and no `measureElement` wiring, so every variable-height bubble (images, multi-line, voice) was mis-measured, causing scroll-jump. The fix is dynamic measurement via `measureElement`, not abandoning virtualization.

- [ ] **Step 1: Add the virtualizer**

In `MessageList.tsx`, add `import { useVirtualizer } from '@tanstack/react-virtual';`. Inside the component, after `parentRef` is declared:
```tsx
const rowVirtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 80,
  overscan: 8,
  measureElement: (el) => el.getBoundingClientRect().height,
  getItemKey: (index) => messages[index].id,
});
```

- [ ] **Step 2: Replace the plain map with a virtualized container**

Replace the message-map container (the `<div className="space-y-3.5">{messages.map(...)}</div>`) with a virtualized absolute-positioned layout. The bubble spacing that `space-y-3.5` provided is replaced by including it in each row's measured height via a `pb-3.5`-equivalent wrapper (use `paddingBottom: 14` inline to match `space-y-3.5` = 0.875rem = 14px, applied to all but visual correctness is fine on every row):
```tsx
<div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
    const msg = messages[virtualRow.index];
    return (
      <div
        key={virtualRow.key}
        data-index={virtualRow.index}
        ref={rowVirtualizer.measureElement}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, paddingBottom: 14 }}
      >
        <MessageBubble
          msg={msg}
          user={user}
          isSelectMode={isSelectMode}
          isSelected={selectedMessages.has(msg.id)}
          toggleMessageSelection={toggleMessageSelection}
          activeReactionMsgId={activeReactionMsgId}
          setActiveReactionMsgId={setActiveReactionMsgId}
          selectedMessageId={selectedMessageId}
          setSelectedMessageId={setSelectedMessageId}
          setMenuPosition={setMenuPosition}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          setDeleteConfirmMsgId={setDeleteConfirmMsgId}
          setDeleteEveryoneConfirmMsgId={setDeleteEveryoneConfirmMsgId}
          onPin={onPin}
          collectionPath={collectionPath}
          roomId={roomId}
          showLightbox={showLightbox}
          resendMessage={resendMessage}
          removeFailedMessage={removeFailedMessage}
          isAdmin={isAdmin}
        />
      </div>
    );
  })}
</div>
```

- [ ] **Step 3: Fix scroll-to-bottom and scroll-anchor to work with the virtualizer**

The old scroll-to-bottom set `parentRef.current.scrollTop = scrollHeight`. With virtualization the true scroll height is `getTotalSize()`, and images resize after paint, so use the virtualizer's imperative scroll instead. In the scroll-to-bottom-on-new effect, replace the `parentRef.current.scrollTop = parentRef.current.scrollHeight` calls with:
```tsx
rowVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
```
In the FAB onClick, use the same `rowVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' })`.
For the scroll-anchor-on-prepend effect: the virtualizer with dynamic `measureElement` and stable `getItemKey` preserves the anchored item automatically when older rows are prepended, so **remove** the manual `prevScrollHeightRef`/`prevScrollTopRef` compensation (the old effect at Task 6's moved lines) and the assignments to those refs in `handleScroll`. Keep `handleScroll`'s `loadOlder` trigger (`scrollTop <= 80 && hasMore && !loading`) and the `isNearBottom`/`newMessageCount` logic (compute `isNearBottom` from `parentRef.current` scroll metrics as before — that still works, the scroll element is unchanged).

- [ ] **Step 4: Verify**

Run: `npm run lint` → 0. Run: `npm run build` → 0.

- [ ] **Step 5: Manual QA (this is the Phase 2 milestone gate)**

With React DevTools Profiler open: scroll a 500+ message thread on a throttled CPU profile (DevTools Performance → CPU 6× slowdown) — confirm no dropped frames and NO scroll-jump when images/voice bubbles measure. Typing in the composer stays lag-free and, per the spec, confirm unrelated bubbles do not re-render on a new message (the `React.memo` + stable keys hold). Load-older prepends without jump. Scroll-to-bottom on new/own message works. If virtualization still causes jump despite `measureElement`, per the spec fall back to a windowed `.slice()` render (render only the last N + a "load older" trigger) rather than reverting to the full unvirtualized map — and note the fallback in the commit.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/MessageList.tsx
git commit -m "perf(chat): virtualize MessageList with measured dynamic row heights"
```

---

### Task 8: Day dividers in `MessageList`

**Files:**
- Modify: `src/components/chat/MessageList.tsx`

**Interfaces:** unchanged.

- [ ] **Step 1: Compute a render-item list with day markers**

Messages are ascending by `createdAt`. Build a memoized flat list of render items so the virtualizer can size each row (dividers included). Add near the top of the component body:
```tsx
type RenderItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; msg: Message };

const toMillis = (v: any): number =>
  v?.toDate ? v.toDate().getTime() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.now();

const dayLabel = (ms: number): string => {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

const renderItems = React.useMemo<RenderItem[]>(() => {
  const items: RenderItem[] = [];
  let lastDayKey = '';
  for (const msg of messages) {
    const ms = toMillis(msg.createdAt);
    const d = new Date(ms);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dayKey !== lastDayKey) {
      items.push({ kind: 'day', key: `day-${dayKey}`, label: dayLabel(ms) });
      lastDayKey = dayKey;
    }
    items.push({ kind: 'message', key: msg.id, msg });
  }
  return items;
}, [messages]);
```

- [ ] **Step 2: Point the virtualizer at `renderItems`**

Change `count: messages.length` → `count: renderItems.length`, and `getItemKey: (index) => renderItems[index].key`. In the row render, branch on the item kind:
```tsx
const item = renderItems[virtualRow.index];
// inside the measured row wrapper:
{item.kind === 'day' ? (
  <div className="flex justify-center py-2">
    <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 bg-surface-soft px-3 py-1 rounded-full">{item.label}</span>
  </div>
) : (
  <MessageBubble msg={item.msg} /* ...all the same props as Task 7... */ />
)}
```
Update the scroll-to-bottom `scrollToIndex` calls to target `renderItems.length - 1` (last render item is the newest message's row).

- [ ] **Step 3: Verify**

Run: `npm run lint` → 0. Run: `npm run build` → 0.

- [ ] **Step 4: Manual QA**

A thread spanning multiple days shows a centered pill divider at each day boundary, labeled "Today"/"Yesterday"/"Month D" (with year when not the current year). Dividers scroll and virtualize correctly (no overlap, no measurement jump). Single-day threads show exactly one divider at the top.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx
git commit -m "feat(chat): add day dividers to the message list"
```

---

### Task 9: Session-based "New messages" unread divider in `MessageList`

**Files:**
- Modify: `src/components/chat/MessageList.tsx`

**Interfaces:** unchanged.

**Approach (per user decision):** purely client/session state — no Firestore schema or rules change. On chat open, capture the id of the newest message present at mount. Draw a single "New messages" divider immediately *before* the first message that (a) has a later `createdAt` than that boundary and (b) was NOT sent by the current user. The divider persists for the session and does not move once shown; it clears on unmount (reopening the chat re-computes a fresh boundary).

- [ ] **Step 1: Capture the session boundary at mount**

Add:
```tsx
// The newest message's timestamp at the moment this chat view mounted.
// Messages strictly newer than this (from others) sit below the "New messages" divider.
const boundaryMsRef = useRef<number | null>(null);
const dividerAnchorKeyRef = useRef<string | null>(null);
useEffect(() => {
  if (boundaryMsRef.current !== null) return;      // capture once per mount
  if (loading) return;                             // wait for first load
  const newest = messages[messages.length - 1];
  boundaryMsRef.current = newest ? toMillis(newest.createdAt) : 0;
}, [loading, messages]);
```

- [ ] **Step 2: Choose the divider anchor and inject it into `renderItems`**

Extend the `renderItems` memo (Task 8) to insert one unread divider. Compute the anchor id once it can be determined, then inject a `{ kind: 'unread' }` item before that message:
```tsx
// inside the renderItems useMemo, after building the day+message list logic,
// determine (once) the first qualifying message id:
if (dividerAnchorKeyRef.current === null && boundaryMsRef.current !== null) {
  const anchor = messages.find(m => toMillis(m.createdAt) > (boundaryMsRef.current as number) && m.senderId !== user?.uid);
  if (anchor) dividerAnchorKeyRef.current = anchor.id;
}
```
Add `boundaryMsRef`/`dividerAnchorKeyRef`/`user?.uid` reads inside the memo's build loop: when emitting the message item whose `msg.id === dividerAnchorKeyRef.current`, push an unread divider item immediately before it:
```tsx
if (dividerAnchorKeyRef.current && msg.id === dividerAnchorKeyRef.current) {
  items.push({ kind: 'unread', key: 'unread-divider', label: 'New messages' });
}
```
Extend the `RenderItem` union with `| { kind: 'unread'; key: string; label: string }`. Add `user?.uid` to the memo dep array. (Because `dividerAnchorKeyRef` is set once and never cleared during the session, the divider position is stable even as more messages arrive.)

- [ ] **Step 3: Render the unread divider row**

In the row branch, add:
```tsx
{item.kind === 'unread' && (
  <div className="flex items-center gap-3 py-2">
    <div className="flex-1 h-px bg-brand-teal/30" />
    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal">{item.label}</span>
    <div className="flex-1 h-px bg-brand-teal/30" />
  </div>
)}
```

- [ ] **Step 4: Verify**

Run: `npm run lint` → 0. Run: `npm run build` → 0.

- [ ] **Step 5: Manual QA**

With two accounts: open a chat (no divider on the messages already present). Have the other account send messages → a single teal "New messages" divider appears above the first newly-arrived message and stays put as more arrive. Your own sends do NOT create or move a divider. Close and reopen the chat → the divider is gone (fresh session boundary). Confirm it virtualizes/measures without jump.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/MessageList.tsx
git commit -m "feat(chat): add session-based 'New messages' unread divider"
```

---

### Task 10: Final Phase 2 verification

**Files:** none (verification only, no commit unless a fix is needed).

- [ ] **Step 1: Full type-check** — Run: `npm run lint` → exits 0.
- [ ] **Step 2: Full build** — Run: `npm run build` → exits 0, `dist/` produced.
- [ ] **Step 3: Rules suite unaffected** — Run: `npm --prefix tests test` → all pass (this phase touches no rules, so this is a regression guard). 
- [ ] **Step 4: Thin-orchestrator check** — `wc -l src/components/chat/*.tsx`. Confirm `ChatView.tsx` is a thin orchestrator (~150-200 lines) and each extracted file has a single clear responsibility.
- [ ] **Step 5: Milestone manual QA** — On a throttled/low-end profile (DevTools CPU 6× or a real Android Capacitor build): scroll a 500+ message thread with no dropped frames and no scroll-jump; typing in the composer stays lag-free with virtualization active; React DevTools Profiler confirms unrelated bubbles do not re-render on a new message. Re-run the DM and club smoke paths from Tasks 1–9 end to end.
- [ ] **Step 6: If any check fails** — Do not proceed to Phase 3. File the failure as a new task at the end of this plan, fix it under its own atomic commit, and re-run Steps 1–5.

---

## Notes for the executor

- **`isNearBottom` computation** stays metric-based off `parentRef.current` (scrollHeight/scrollTop/clientHeight) — the scroll element is the same `parentRef` div whether or not virtualization is active, so that logic is unchanged across Tasks 6–7.
- **`ClubSenderAvatar`/`ClubSenderName`** each do their own `getDoc` when `senderName` is missing; this is existing behavior kept as-is in Task 1 (Phase 2 does not optimize it — that's a separate concern).
- **Do not** change `useChatEngine.ts`, `ClubChat.tsx`, or `ChatRoom.tsx` anywhere in this plan.
- After each extraction, the fastest way to find newly-unused imports in `ChatView.tsx` is to let `tsc --noEmit` (via `npm run lint`) report them under `noUnusedLocals`, then delete exactly those.
</content>
</invoke>
