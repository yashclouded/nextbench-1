# 🔴 NextBench — Things To Fix

> **Comprehensive audit** of every reason NextBench isn't competitive with flagship social media apps (Instagram, X, Discord, Depop) in terms of **bugs**, **loading times**, **security**, and **architecture**.
>
> Organized into **7 phased fix plans**, ordered by severity and impact.

---

## Table of Contents

1. [Phase 1 — Critical Security Vulnerabilities](#phase-1--critical-security-vulnerabilities)
2. [Phase 2 — Performance & Loading Time Catastrophes](#phase-2--performance--loading-time-catastrophes)
3. [Phase 3 — Architecture & Code Quality Rot](#phase-3--architecture--code-quality-rot)
4. [Phase 4 — UX Bugs & Broken Interactions](#phase-4--ux-bugs--broken-interactions)
5. [Phase 5 — Data Integrity & Backend Gaps](#phase-5--data-integrity--backend-gaps)
6. [Phase 6 — Missing Production Infrastructure](#phase-6--missing-production-infrastructure)
7. [Phase 7 — Feature Parity Gaps vs. Flagship Social Apps](#phase-7--feature-parity-gaps-vs-flagship-social-apps)

---

## Phase 1 — Critical Security Vulnerabilities

These are **ship-stopping** issues. Any competent attacker can exploit these in under 30 minutes. No flagship app would ship with any of these.

---

### 1.1 — `.env` file committed with live Firebase credentials

**File**: `.env`

- The `.env` file containing `VITE_FIREBASE_API_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`, and other credentials is **tracked in the repository**.
- `.gitignore` does list `.env`, but the file already exists in the repo (once committed, gitignore doesn't retroactively remove it).
- **Impact**: Anyone cloning the repo has immediate access to the Firebase project and Cloudinary account.

**Fix**:
- Rotate ALL exposed credentials immediately.
- Verify `.env` is excluded from git history using `git log --all -- .env`.
- If found, use `git filter-repo` to scrub it from all branches/tags.
- Rotate Firebase API keys, Cloudinary preset, and all other secrets.

---

### 1.2 — Push notification API has ZERO authentication

**File**: `api/send-notification.js`

- The `/api/send-notification` Vercel serverless function accepts **any POST request** from **any origin** with `Access-Control-Allow-Origin: *`.
- No Firebase auth token verification, no API key, no CSRF token, no rate limiting.
- An attacker can spam push notifications to **any user** if they know (or brute-force) FCM tokens.

**Fix**:
- Verify the Firebase ID token from `Authorization: Bearer <token>` header using `admin.auth().verifyIdToken()`.
- Restrict CORS to `https://nextbench.in` only.
- Add per-user rate limiting (e.g., 10 notifications/minute).

---

### 1.3 — Verification API endpoint has ZERO authentication

**File**: `api/verify.ts`

- The `/api/verify` Vercel serverless function (AI-powered ID card verification) is fully open.
- `Access-Control-Allow-Origin: *` — any website can call it.
- No auth check — any anonymous user can trigger expensive Gemini API calls, consuming your API quota.
- Contains hardcoded fallback `projectId: 'nextbench-a11ed'` in source code.

**Fix**:
- Add Firebase ID token verification before processing.
- Rate limit per user (max 3 verification attempts/hour).
- Remove hardcoded project ID fallback from source code.
- Restrict CORS to production domain only.

---

### 1.4 — `dangerouslySetInnerHTML` without sanitization (XSS)

**File**: `src/pages/Dashboard/AdminPanel.tsx` (line 718)

```tsx
<div dangerouslySetInnerHTML={{ __html: emailBodyHtml }} />
```

- The admin email broadcast preview renders raw HTML without DOMPurify or any sanitization.
- If the admin panel is ever compromised (or an admin is tricked into pasting malicious HTML), this is a direct **Stored XSS** vector.

**Fix**:
- Install and use `DOMPurify.sanitize(emailBodyHtml)` before rendering.
- Apply CSP headers that block inline scripts.

---

### 1.5 — Cloudinary upload preset is unsigned (unauthenticated uploads)

**File**: `src/lib/storage.ts`

- All uploads use an **unsigned upload preset** (`VITE_CLOUDINARY_UPLOAD_PRESET`), meaning **anyone** with the cloud name and preset can upload arbitrary files to your Cloudinary account directly.
- No server-side validation of file type or content. The entire moderation pipeline is **client-side only** — trivially bypassed with `curl`.
- No file size enforcement on the server side.

**Fix**:
- Move to **signed uploads** using a server-side endpoint that generates Cloudinary signatures.
- Enforce file size limits, file type validation, and content moderation on the server (Cloud Function or Vercel serverless).
- Add Cloudinary webhook for post-upload moderation.

---

### 1.6 — Image moderation fails open (auto-approves on error)

**File**: `src/lib/imageModeration.ts` (lines 140-149)

```typescript
catch (err) {
  // If the model fails to load, we fail open
  return { isSafe: true, reason: 'Image moderation unavailable — auto-approved.' };
}
```

- If TensorFlow.js fails to load (ad blocker, CDN down, network error), **all images are auto-approved**.
- This is trivially exploitable: block the nsfwjs CDN → upload anything.
- The entire moderation system is **client-side only** — can be entirely bypassed by calling Cloudinary directly.

**Fix**:
- Move image moderation to the server (Cloudinary moderation add-on, or a Cloud Function with Google Cloud Vision API).
- On client-side failure, **queue the image for manual server-side review** instead of auto-approving.

---

### 1.7 — Text moderation is trivially bypassable

**File**: `src/lib/moderation.ts`

- Client-side-only word blacklist. Users can:
  - Bypass entirely by making Firestore writes directly (using the Firebase SDK from browser console).
  - Use Unicode homoglyphs not covered by the 18-character mapping table (Cyrillic а, е, о, etc.).
  - Use zero-width characters to break word matching.
- The banned list has only ~15 words — trivially incomplete for a social platform.

**Fix**:
- Move content moderation to Cloud Functions (`onDocumentCreated` trigger).
- Use Google Cloud Natural Language API or Perspective API for toxicity detection.
- Client-side check should be a UX convenience only, never a security boundary.

---

### 1.8 — Firestore rules allow public read of ALL user documents

**File**: `firestore.rules` (lines 50-51)

```
allow get: if true;
allow list: if true;
```

- **Any unauthenticated user** can read every user document in the database.
- This exposes: names, emails, schools, cities, profile pictures, ID card URLs, selfie URLs, verification status, admin status, FCM tokens, and more.
- Same issue with `posts` (line 366-367), `post_replies` (line 447-448), `products` (line 129-130), and `schools` (line 527).

**Fix**:
- Users collection: `allow get: if isSignedIn()` at minimum. Consider field-level access control (hide email, idCardUrl, selfieUrl from non-self, non-admin).
- Posts/products: `allow get: if true` is acceptable for public content, but `list` should be bounded (require a status filter).
- FCM tokens in user docs should be **removed** — store in a private subcollection like `users/{uid}/private/tokens`.

---

### 1.9 — Admin check relies on client-readable `isAdmin` field

**File**: `firestore.rules` (line 9)

- `isAdmin` is a field on the user document, readable by anyone (`allow get: if true`).
- While the Firestore rule `isAdmin()` function checks this correctly for write operations, the admin field itself is exposed publicly — attackers know exactly who the admins are.
- More importantly, the admin check in the client (`userData?.isAdmin`) controls UI rendering of the admin panel — if Firestore rules had a single flaw, privilege escalation would be trivial.

**Fix**:
- Use **Firebase Custom Claims** for admin roles (set via Admin SDK).
- Check `request.auth.token.admin == true` in rules instead of a document field.
- Custom claims are embedded in the auth token and can't be read by other users.

---

### 1.10 — No Content Security Policy (CSP) headers

**File**: `index.html`

- No CSP meta tag or server-side header.
- No `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or `Referrer-Policy` headers.
- The site is vulnerable to clickjacking, MIME-type sniffing attacks, and more.

**Fix**:
- Add CSP headers via `vercel.json` or a Vercel middleware.
- Start with: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.cloudinary.com`.
- Add `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security: max-age=31536000`.

---

### 1.11 — No rate limiting on Firestore client writes

- Any authenticated user can spam the database with unlimited writes (posts, messages, reactions, follows, notifications).
- Firestore rules check data validity but don't enforce write frequency.
- An attacker can create thousands of notifications for a target user, or spam posts/messages.

**Fix**:
- Add server-side rate limiting via Cloud Functions (e.g., `onDocumentCreated` triggers that check write frequency and delete excess).
- For critical paths (post creation, message sending), move writes behind a Cloud Function `onCall` that enforces per-user rate limits.

---

### 1.12 — Notifications can be created targeting ANY user

**File**: `firestore.rules` (lines 325-329)

```
allow create: if isSignedIn()
  && incoming().userId is string
  && incoming().type is string
  && incoming().title is string
  && incoming().read == false;
```

- Any signed-in user can create a notification document with **any `userId`** — they can spam notifications to any other user with arbitrary titles and messages.
- No validation that the notification relates to a real action.

**Fix**:
- Notification creation should be **server-side only** (Cloud Functions).
- Remove client `create` permission entirely from Firestore rules.
- Have Cloud Function triggers create notifications as a side effect of real actions (follows, upvotes, messages).

---

### 1.13 — Duplicate `reply_upvotes` Firestore rules override each other

**File**: `firestore.rules` (lines 414-419 and 474-478)

- Two `match /reply_upvotes/{upvoteId}` blocks with **different** delete rules. The second block is more permissive (doesn't check post author). Firestore uses the **last matching rule**, so the stricter delete rule on line 418 is silently overridden.

**Fix**:
- Remove the duplicate block. Keep only the stricter rule set.
- Add a comment explaining the intended access control.

---

## Phase 2 — Performance & Loading Time Catastrophes

Flagship apps load in under 1 second. NextBench has fundamental issues that cause multi-second load times and significant UI jank.

---

### 2.1 — Feed.tsx is a 2,791-line single-file monolith (122 KB)

**File**: `src/pages/Dashboard/Feed.tsx` — **2,791 lines, 122 KB**

- This single file contains: the post creation form, image cropper integration, poll creator, video upload, post detail modal, comment system (with nested threads), GIF picker, infinite scroll, feed scoring algorithm, all user interaction handlers, and every piece of state.
- **~60+ `useState` hooks** in the main `Feed` component alone.
- The component re-renders on virtually any state change, causing cascading re-renders of the entire post list.
- **Impact**: Massive JS parse time, massive memory footprint, impossible to code-split or tree-shake.

**Fix — Decompose into ~10-15 focused components and hooks**:
- `FeedPage.tsx` — orchestrator, < 200 lines
- `CreatePostModal.tsx` — post creation form, image/video upload, poll creator
- `PostDetailModal.tsx` — full post view, action bar
- `CommentThread.tsx` — nested comment display and input
- `GifPicker.tsx` — GIPHY integration
- `PollCreator.tsx` — poll choice editor
- `FeedList.tsx` — virtualized feed rendering
- Custom hooks:
  - `useFeedPosts.ts` — Firestore subscription, scoring, pagination
  - `useFeedActions.ts` — upvote, downvote, share, delete handlers
  - `useVoteSystem.ts` — upvote/downvote state management
  - `useComments.ts` — reply loading, submission, sorting

---

### 2.2 — Profile.tsx is 1,587 lines (79 KB), same monolith issue

**File**: `src/pages/Dashboard/Profile.tsx` — **1,587 lines, 79 KB**

- Same monolith problem: ~40+ useState hooks, inline modals, settings, followers/following lists, user posts, user listings, reviews — all in one file.
- Parse time alone is significant on mobile devices.

**Fix — Extract into composable components**:
- `ProfileHeader.tsx` — avatar, name, bio, follow button
- `FollowersModal.tsx` — followers/following list display
- `ProfileTabs.tsx` — tab switcher
- `ProfilePosts.tsx` — user's post grid
- `ProfileListings.tsx` — user's marketplace listings
- Custom hooks: `useProfileData.ts`, `useProfileActions.ts`

---

### 2.3 — TensorFlow.js + NSFWJS bundled in the client (6+ MB precache)

**Files**: `package.json`, `vite.config.ts` (line 103)

- `@tensorflow/tfjs` (4.22.0) and `nsfwjs` are in production dependencies.
- `chunkSizeWarningLimit: 6000` — this Vite warning was *suppressed* instead of fixing the root cause.
- `maximumFileSizeToCacheInBytes: 6 * 1024 * 1024` — the service worker precaches **6 MB chunks**.
- Even with code splitting into a separate `nsfwjs` chunk, the model loads on the client and downloads ~4 MB of model weight shards.
- **Impact**: Mobile users on slow connections wait 10+ seconds for the TF.js model. Battery drain is significant.

**Fix**:
- **Remove** TensorFlow.js and nsfwjs from the client bundle entirely.
- Move NSFW detection to a Cloud Function using Google Cloud Vision API, or use Cloudinary's built-in moderation add-on.
- This single change will reduce the total bundle by **~70%**.

---

### 2.4 — No image lazy loading or list virtualization

- The feed renders ALL visible posts + their images simultaneously. No windowing/virtualization (e.g., `react-window`, `react-virtuoso`).
- Images use Cloudinary `w_800` but no `loading="lazy"` attribute on most `<img>` tags.
- On a feed with 15 posts, each with images, the browser is decoding and painting dozens of images simultaneously.
- Profile pictures are fetched individually via Firestore `getDoc` inside each `Comment` component (N+1 query pattern).

**Fix**:
- Add `loading="lazy"` to all non-above-fold images.
- Implement virtualized scrolling for feed and chat message lists using `react-virtuoso` or similar.
- Batch-fetch profile pictures in a single query instead of per-comment individual `getDoc` calls.
- Use Cloudinary's responsive image transformations (`dpr_auto`, `w_auto`).

---

### 2.5 — 6+ simultaneous Firestore listeners on Feed mount

- Feed page alone opens **6+ simultaneous onSnapshot listeners** on mount:
  1. Posts collection (with author resolution — additional batch `getDocs` queries)
  2. Products collection (with seller resolution — additional batch `getDocs` queries)
  3. Post upvotes (user's upvoted posts)
  4. Post downvotes (user's downvoted posts)
  5. Saved posts (user's saved posts)
  6. Reply upvotes (user's reply upvotes)
  7. Wishlist items (user's wishlisted products)
- Each listener keeps a persistent WebSocket connection. On mobile, this drains battery and bandwidth.
- Upvotes/downvotes/saves are fetched with `getDocs` (one-shot) but reply upvotes use `onSnapshot` — inconsistent patterns.

**Fix**:
- Consolidate user-specific vote data into a single aggregated `onSnapshot` subscription or a batched Cloud Function endpoint.
- Cache vote data locally and sync periodically rather than maintaining 6+ live listeners.
- Consider a "user feed state" document pattern: `userFeedState/{userId}` containing all upvoted/downvoted/saved post IDs.

---

### 2.6 — Search page fetches 200 user documents on first render

**File**: `src/pages/Dashboard/Search.tsx` (line 79)

```typescript
getDocs(query(collection(db, 'users'), limit(200)))
```

- The search page downloads **200 full user documents** (with all fields: emails, school, verification data, FCM tokens, etc.) just to show "suggested users."
- This is done entirely client-side. There is no full-text search index (Algolia, Typesense, or Firestore text search extension).
- Search is a `string.includes()` filter on client-fetched data — won't scale past a few hundred users.
- **Billing impact**: 200 Firestore reads every time a user opens the search page.

**Fix**:
- Implement proper search with Algolia, Typesense, or Firestore's full-text search extension.
- For suggestions, create a lightweight Cloud Function that returns only necessary fields (name, avatar, school).
- Never expose 200 full user documents to the client.

---

### 2.7 — AdminPanel fires 9 full collection queries simultaneously on mount

**File**: `src/pages/Dashboard/AdminPanel.tsx` (lines 49-59)

- On mount, `fetchStats` fires **9 simultaneous `getDocs` calls** including full `users` collection scans and full `products` collection scans.
- On the "Users" tab, it fetches **ALL users** with no pagination.
- **Billing impact**: Every time an admin opens the panel, it reads every document in multiple collections.

**Fix**:
- Use `getCountFromServer()` for dashboard stats (Firestore has a dedicated count API).
- Implement server-side cursor-based pagination for user management.
- Create a dedicated admin stats Cloud Function that computes and caches stats.

---

### 2.8 — No bundle optimization (compression, tree-shaking, dynamic imports)

- `firebase` package is imported as a monolith (12.13.0). Even with the `firebase` manual chunk, the full SDK is large.
- No `vite-plugin-compression` for gzip/brotli pre-compression.
- No dynamic imports for heavy components like `ImageCropper`, `PollDisplay`, `PdfViewer`, `VideoPlayer`.
- 60+ individual `lucide-react` icon imports across the app — while each is small, they add up in parse time.

**Fix**:
- Add `vite-plugin-compression` for brotli/gzip pre-compression of all static assets.
- Lazy-load heavy components with `React.lazy()`: `ImageCropper`, `PdfViewer`, `VideoPlayer`, `PollDisplay`, `GifPicker`.
- Analyze the full bundle with `npx vite-bundle-visualizer` and eliminate dead code paths.
- Consider Firebase modular imports to reduce the Firebase chunk size.

---

### 2.9 — Landing page is a 44 KB single-file component

**File**: `src/pages/LandingPage.tsx` — **44,588 bytes**

- The landing page (the first thing unauthenticated users see) is a single massive component.
- It renders dozens of sections, animations, and data fetches on initial load.
- No above-the-fold / below-the-fold content splitting.

**Fix**:
- Split into above-the-fold hero section (instantly loaded) and lazy-loaded sections below.
- Use `Intersection Observer` to trigger loading of lower sections only when they scroll into view.
- Defer non-critical animations to after LCP.

---

### 2.10 — PWA service worker precaches ALL JS/CSS/HTML chunks

**File**: `vite.config.ts` (line 17)

```typescript
globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
```

- The service worker precaches **every single asset** on the first visit. With TF.js chunks, this could be 10+ MB total.
- Users on slow mobile connections will experience significant delays as the SW downloads everything in the background, competing with the main thread for bandwidth.

**Fix**:
- Only precache the app shell (main entry point, critical CSS, key fonts).
- Use **runtime caching** strategies (StaleWhileRevalidate, CacheFirst) for route chunks as the user navigates.
- Remove TF.js chunks from precache entirely (see 2.3).

---

## Phase 3 — Architecture & Code Quality Rot

These issues make the codebase unmaintainable, fragile, and prone to regressions. Flagship apps have strict architecture standards enforced by tooling.

---

### 3.1 — Pervasive `any` type usage (40+ files)

- Nearly every file in the codebase uses `any` types: `useState<any>`, function params typed as `any`, Firestore data cast to `any`.
- No shared type definitions for core entities (Post, User, Product, ChatRoom, Club, Message, Notification).
- The `Comment` component has `any` as its entire props type. Firestore snapshot data is always `d.data() as any`.

**Fix**:
- Create a `src/types/` directory with shared interfaces: `User`, `Post`, `Product`, `ChatRoom`, `ClubData`, `Message`, `Notification`, `Reply`.
- Gradually replace `any` with proper types across all files.
- Run `tsc --noEmit --strict` to surface all violations.
- Enable `strict: true` in `tsconfig.json`.

---

### 3.2 — Console statements left everywhere in production code

- **38+ files** contain `console.log`, `console.error`, or `console.warn` statements.
- These expose internal error details, Firestore collection paths, and state machine transitions to any user opening DevTools.
- Some `console.warn` calls leak error objects with stack traces.

**Fix**:
- Replace with a structured logging utility that is silent in production.
- Use `import.meta.env.DEV` guards for debug-only logging.
- Strip console calls in production build with a Vite plugin like `vite-plugin-strip` or `terserOptions.compress.drop_console`.

---

### 3.3 — Hardcoded school lists duplicated in multiple files

**Files**: `src/pages/Auth/Signup.tsx` (lines 12-21), `src/pages/Dashboard/Search.tsx` (lines 7-16)

- Two identical hardcoded school arrays in different files. If one is updated and the other isn't, they'll diverge and create inconsistency.
- The actual school list is fetched from Firestore's `schools` collection elsewhere, making these redundant.

**Fix**:
- Delete all hardcoded school arrays.
- Always fetch from Firestore `schools` collection.
- Create a `useSchools()` hook with client-side caching so the data is fetched once and shared.

---

### 3.4 — No shared state management or query caching

- Every page independently fetches its own data from Firestore, maintaining dozens of local `useState` hooks.
- No React Context for shared feed state, no query caching library (TanStack Query / SWR).
- Result: navigating from Feed to Profile and back **re-fetches everything from scratch**. Every navigation incurs full Firestore reads and loading spinners.

**Fix**:
- Adopt **TanStack Query (React Query)** for all Firestore data fetching — provides caching, deduplication, background refetching, optimistic updates, and stale-while-revalidate out of the box.
- Or use **Zustand** for lightweight global stores for frequently-accessed data (current user, vote state, following IDs).

---

### 3.5 — No test suite whatsoever

- Zero unit tests, zero integration tests, zero E2E tests.
- No test framework configured (`package.json` has no `test` script).
- Any refactoring or feature addition is a regression minefield — you can't safely change anything.

**Fix**:
- Set up **Vitest** (native to Vite) for unit/integration tests.
- Prioritize testing critical business logic first: feed scoring algorithm, text moderation, trending algorithm, vote counting, OTP generation.
- Add **Playwright** or **Cypress** for critical user flows: signup → verify → create post → view feed → send message.

---

### 3.6 — Scattered utility/migration scripts in project root

- Files like `clear_conflicting_usernames.mjs`, `migrate_city.mjs`, `update_schools.js`, `test-pfp.js`, `fix-iam.cjs`, `fix-iam.js`, `dummy.sh`, `fix-indexes.mjs`, `query-test.js` are in the project root.
- These aren't gitignored and pollute the project, making it harder to navigate and understand.

**Fix**:
- Move all scripts to a `scripts/` or `tools/` directory.
- Gitignore one-off migration scripts that shouldn't ship.
- Add a `README.md` in the scripts directory documenting what each script does.

---

### 3.7 — Both `package-lock.json` AND `pnpm-lock.yaml` exist

- Two package managers (npm and pnpm) have generated lock files, suggesting inconsistent tooling across developers or environments.
- This can cause dependency resolution differences and phantom bugs.

**Fix**:
- Choose one package manager and delete the other's lock file.
- Add an `engines` field to `package.json`.
- Add a `.npmrc` or equivalent to enforce the chosen package manager.
- Consider adding `only-allow` package to prevent accidental use of the wrong manager.

---

## Phase 4 — UX Bugs & Broken Interactions

---

### 4.1 — GIPHY API key missing from `.env`, GIF picker silently broken

- `VITE_GIPHY_API_KEY` is referenced in `Feed.tsx` (line 364) but not present in `.env` (only in `.env.example` as `your_actual_key_here`).
- The GIF picker will silently fail with API errors when users try to use it — they'll see "Trending GIFs loading..." forever.

**Fix**:
- Add the actual GIPHY API key to `.env`.
- Add a fallback UI when the key is missing or the API returns an error ("GIFs are currently unavailable").
- Consider moving GIPHY key to a server-side proxy to prevent exposure in client code.

---

### 4.2 — N+1 query pattern in comment avatar loading

**File**: `src/pages/Dashboard/Feed.tsx` (lines 169-177)

- Each `Comment` component fires a `getDoc` to fetch the user's profile picture if not already present — classic N+1 query problem.
- A post with 50 comments triggers 50 individual Firestore reads just for profile pictures.
- No caching between renders or across comments by the same author.

**Fix**:
- Batch-resolve all unique author profile pictures once when the replies list is loaded, using a single `where('__name__', 'in', authorIds)` query.
- Cache the results in a `Map` and pass them down to each `Comment` component as props.

---

### 4.3 — Reply image preview creates unrevoked object URLs (memory leak)

**File**: `src/pages/Dashboard/Feed.tsx` (line 647)

```tsx
<img src={URL.createObjectURL(replyImageFile)} />
```

- `URL.createObjectURL()` is called inline during render without `URL.revokeObjectURL()` cleanup.
- Each re-render creates a new blob URL that leaks memory until the page is unloaded.
- On long sessions with multiple image previews, this accumulates.

**Fix**:
- Use a `useMemo` + `useEffect` cleanup pattern:
  ```tsx
  const previewUrl = useMemo(() => replyImageFile ? URL.createObjectURL(replyImageFile) : null, [replyImageFile]);
  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);
  ```

---

### 4.4 — Feed limited to 15 posts with no real pagination (fake infinite scroll)

**File**: `src/pages/Dashboard/Feed.tsx` (line 944)

```typescript
limit(15)
```

- The feed Firestore query is hard-limited to 15 posts. The `InfiniteScrollSentinel` component exists and increases `visibleCount`, but it only controls which of the **already-fetched** 15 posts are visible — it doesn't fetch more data from Firestore.
- Users will see the same 15 posts forever, with no way to discover older content.
- This is a **fake infinite scroll** — it looks like it should work but doesn't actually load more data.

**Fix**:
- Implement proper Firestore cursor-based pagination using `startAfter(lastVisibleDoc)`.
- When the `InfiniteScrollSentinel` triggers, fire a new query with `startAfter()` and append results.
- Consider loading in batches of 10 and caching previous pages.

---

### 4.5 — `window.scrollTo(0, 0)` jank on ChatRoom mount

**File**: `src/pages/Dashboard/ChatRoom.tsx` (line 117)

- Scrolls the **entire page** to the top on ChatRoom mount. In a three-column dashboard layout, this is extremely jarring.
- Chat messages should auto-scroll to the bottom of the message container, not reset the entire page scroll position.

**Fix**:
- Replace with `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })` to scroll within the chat container only.
- Don't touch `window.scrollTo` from a nested component.

---

### 4.6 — Location filter hardcoded to "Lucknow" only

**File**: `src/pages/Dashboard/Search.tsx` (line 18)

```typescript
const LOCATIONS = ["Lucknow"];
```

- The location filter dropdown only has "Lucknow." Any user from another city has no filtering option.
- As the platform expands, this will silently exclude all non-Lucknow users from search results.

**Fix**:
- Dynamically populate locations from the Firestore `schools` collection, extracting unique city values.
- Or maintain a `locations` collection in Firestore that admins can update.

---

### 4.7 — No offline fallback or error state for failed network requests

- When Firestore is unreachable (bad network, flight mode, etc.), the app shows a blank page or a perpetual loading spinner.
- No "You're offline" banner, no retry button, no display of cached data.
- The Firestore persistent cache helps with reads, but users get no visual feedback about their connectivity state.
- Failed writes (posts, messages) are silently lost.

**Fix**:
- Add a global network status listener (`navigator.onLine` + `online`/`offline` events).
- Show an offline banner when disconnected.
- Queue failed writes for retry when connectivity is restored (Firestore's `enableIndexedDbPersistence` helps with reads, but writes need explicit handling).
- Display cached data with a "you're viewing cached content" indicator.

---

## Phase 5 — Data Integrity & Backend Gaps

---

### 5.1 — Vote counts are client-managed with race conditions

- Upvote/downvote counts are incremented/decremented on the client via `updateDoc` with manual count arithmetic.
- Two users upvoting simultaneously can cause lost updates (classic read-modify-write race condition).
- No use of Firestore's atomic `increment()` field transform or transactions for vote counts.

**Fix**:
- Use `increment(1)` / `increment(-1)` for all counter fields (`upvotesCount`, `downvotesCount`, `repliesCount`, `sharesCount`).
- Or better yet: move vote counting to a Cloud Function trigger on `post_upvotes` document creation/deletion.
- This ensures counts are always accurate regardless of client behavior.

---

### 5.2 — No atomic operations for follow/unfollow (5-step non-transactional flow)

**File**: `src/lib/follows.ts` (lines 12-54)

- `followUser` does: query → check → `addDoc` → `getDoc` (user name) → `addDoc` (notification) — **5 separate operations** with no transaction.
- If the notification write fails (or any intermediate step fails), the follow is still recorded, leaving inconsistent state.
- `unfollowUser` deletes all matching docs but doesn't clean up follower/following count caches or notification records.

**Fix**:
- Wrap the entire follow/unfollow flow in a Firestore batch write or transaction.
- Or (preferred): move to a Cloud Function `onCall` that atomically handles the follow + notification + count updates server-side.

---

### 5.3 — Club member count will drift from reality

**File**: `src/lib/clubs.ts`

- `memberCount` is a separate field that's manually incremented/decremented alongside `memberIds` array modifications.
- If any operation fails halfway, or if `memberIds` is modified by multiple users simultaneously (race condition), `memberCount` will drift from `memberIds.length`.
- Over time, these numbers diverge silently.

**Fix**:
- Option A: Compute `memberCount` from `memberIds.length` on read (simpler, slightly slower).
- Option B: Use a Cloud Function trigger on `clubs/{clubId}` updates to atomically maintain the count.
- Option C: Use `arrayUnion`/`arrayRemove` with `increment()` in a batch write.

---

### 5.4 — No data retention or cleanup policies

- Deleted messages set `isDeletedForEveryone: true` but the document remains in Firestore **indefinitely** (still consuming storage and appearing in queries).
- Old notifications pile up forever with no expiry.
- Expired polls remain in the database.
- OTP rate limit documents in `emailOtpRateLimits` are never cleaned up.
- Inactive chat rooms and abandoned DM rooms accumulate.

**Fix**:
- Create a **scheduled Cloud Function** (daily or weekly) that:
  - Purges notification documents older than 90 days.
  - Hard-deletes soft-deleted messages older than 30 days.
  - Removes expired poll data.
  - Cleans up OTP rate limit docs older than 24 hours.
  - Archives or deletes chat rooms with no activity for 6+ months.

---

### 5.5 — Denormalized author data goes stale after profile updates

- Posts store `authorName`, `authorProfilePicture`, `school` at write time as denormalized copies.
- When a user updates their name, profile picture, or school, all their old posts/products still show the old data.
- The feed does a runtime resolution via a `userCache` (lines 947-989), but shared URLs, notifications, and other surfaces display stale denormalized names.

**Fix**:
- Create a Cloud Function trigger on `users/{uid}` updates that batch-updates denormalized fields in related posts, products, replies, and chat rooms.
- Alternatively, always resolve author data at read time (more reads, but always fresh).

---

### 5.6 — Presence heartbeat writes cost serious money at scale

**File**: `src/lib/presence.ts`

- Every online user writes to their user document **every 60 seconds** — that's **1,440 writes/day per active user**.
- With 1,000 DAU, that's **1.44 million writes/day** just for presence. Firestore charges $0.18 per 100K writes.
- `useOnlineCount` queries ALL users with `online == true` — reads the entire active user set every time.

**Fix**:
- Move presence to **Firebase Realtime Database (RTDB)**, which has built-in `onDisconnect` and is much cheaper for high-frequency writes (charged by bandwidth, not per-write).
- Or use a Cloud Function-based presence system with longer heartbeat intervals (5 min instead of 1 min).
- For online count, maintain a single server-side counter document rather than a client-side full-collection query.

---

## Phase 6 — Missing Production Infrastructure

Flagship social apps have entire teams maintaining this infrastructure. NextBench has none of it.

---

### 6.1 — No CI/CD pipeline

- No GitHub Actions workflow, no automated Vercel deployment hooks tied to testing, no checks on PRs.
- Any push to `main` could ship broken TypeScript, untested code, or security vulnerabilities directly to production.

**Fix**:
- Set up a GitHub Actions pipeline:
  1. TypeScript type checking (`tsc --noEmit`)
  2. Linting (`eslint`)
  3. Unit tests (`vitest run`)
  4. Production build (`vite build`)
  5. Deploy to Vercel preview on PR
  6. E2E tests against preview
  7. Deploy to production on merge to `main`

---

### 6.2 — No error tracking or crash monitoring

- No Sentry, no LogRocket, no Firebase Crashlytics for web.
- Production errors disappear silently into the void. Users see blank pages with no feedback.
- The `ErrorBoundary` component exists but only shows a generic UI — it doesn't report the error to any monitoring service.

**Fix**:
- Integrate **Sentry** for error tracking (free tier covers most needs).
- Add the Sentry Vite plugin for source map uploads.
- Connect the `ErrorBoundary` component to Sentry's `captureException`.
- Set up Slack/Discord alerts for new error types.

---

### 6.3 — No analytics or user behavior tracking

- No Firebase Analytics, no Mixpanel, no PostHog — not even basic page view tracking.
- No way to know what features are actually used, where users drop off in the signup funnel, or what the real performance looks like in the wild.

**Fix**:
- Integrate **Firebase Analytics** (free, already part of the Firebase SDK) or **PostHog** (generous free tier, privacy-friendly).
- Track key events: signup completion, post creation, message sent, product listed, search performed.
- Monitor funnel conversion rates.

---

### 6.4 — No Web Vitals monitoring

- No Core Web Vitals measurement (LCP, INP, CLS).
- No way to know if the site meets Google's "Good" thresholds.
- Given the bundle size (6+ MB with TF.js) and Firestore cold starts, LCP is almost certainly >4 seconds (rated "Poor").

**Fix**:
- Add the `web-vitals` library (tiny, tree-shakeable).
- Report metrics to your analytics service or a dedicated monitoring tool.
- Set performance budgets and fail CI if they're exceeded.

---

### 6.5 — No backup strategy for Firestore data

- No automated Firestore exports or backups.
- A single Firestore rule bug, a bad migration script (several exist in the root), or an admin mistake could permanently delete all user data.
- There is no recovery path.

**Fix**:
- Set up **automated daily Firestore exports** to Google Cloud Storage via a scheduled Cloud Function or the `gcloud firestore export` command.
- Configure Cloud Storage lifecycle rules to retain 30 days of backups.
- Test the restore process periodically.

---

### 6.6 — No staging/preview environment

- Only the production environment exists. Every change goes directly to live users.
- No way to safely test Firestore rule changes, Cloud Function updates, or UI changes before they hit real users.

**Fix**:
- Create a separate Firebase project for staging (e.g., `nextbench-staging`).
- Use Vercel preview deployments for PRs (automatically generated).
- Test Firestore rule changes against the staging project before deploying to production.
- Use Firebase Emulator Suite for local development.

---

## Phase 7 — Feature Parity Gaps vs. Flagship Social Apps

These aren't bugs — they're **missing table-stakes features** that every competitive social platform has. Users will expect these, and their absence makes the platform feel unfinished.

---

### 7.1 — No email verification flow for critical actions

- Users sign up with Google OAuth only. No email/password option with email verification for the account itself.
- While OTP verification exists for the "school email" flow, there's no protection against account takeover scenarios.

**Fix**: Support email/password signup with email verification. Add 2FA option for high-value accounts.

---

### 7.2 — No account deletion flow

- No way for users to delete their own account and all associated data. This is **legally required** under:
  - GDPR (EU)
  - India's Digital Personal Data Protection Act (DPDP)
  - Apple App Store guidelines (mandatory for any future iOS app)
  - Google Play Store guidelines

**Fix**: Implement a self-service account deletion flow. Create a Cloud Function that cascades deletion across all collections (posts, messages, follows, notifications, etc.).

---

### 7.3 — No password reset / account recovery

- If Google account access is lost, there's no recovery mechanism whatsoever.
- No "forgot password" flow (since there's no password-based auth).

**Fix**: If adding email/password auth, include a standard password reset flow. If staying Google-only, add a support contact for account recovery.

---

### 7.4 — No notification preferences / do-not-disturb

- Users can't mute specific notification types, set quiet hours, or selectively disable push notifications.
- It's all-or-nothing: you get every notification or none.

**Fix**: Add a notification preferences UI (profile settings → notifications) with per-type toggles: follows, messages, post reactions, mentions, admin notices.

---

### 7.5 — No content moderation queue transparency

- Posts go to "pending" status but users have no visibility into:
  - Why their post was rejected
  - How long review typically takes
  - The ability to appeal a rejection
  - What the content guidelines actually are

**Fix**: Add a "My Posts" section showing post status. Send a notification explaining rejection reasons. Publish community guidelines.

---

### 7.6 — No full-text search

- Search is a client-side `string.includes()` filter on pre-fetched data.
- No stemming, fuzzy matching, relevance ranking, or search suggestions.
- Doesn't scale past a few hundred users/posts.

**Fix**: Implement proper search with Algolia, Typesense, or Firestore's full-text search extension. Index posts, users, products, and clubs.

---

### 7.7 — No media compression/optimization pipeline

- Images are uploaded as-is to Cloudinary — no server-side resizing, no WebP/AVIF conversion, no thumbnail generation for feed cards vs. detail views.
- Cloudinary's `f_auto,q_auto` helps at display time, but storage still holds full-size originals.
- No video compression or transcoding pipeline.

**Fix**: Configure Cloudinary eager transformations to generate multiple sizes on upload. Create thumbnails (200px) for feed cards and medium sizes (800px) for detail views. Implement video transcoding for consistent playback.

---

### 7.8 — No read receipts in DMs

- Chat rooms track `unreadBy` at the room level, but individual messages have no delivery/read status.
- Users can't tell if their message was delivered, read, or even sent successfully.

**Fix**: Add `deliveredAt` and `readAt` timestamps to individual message documents. Show delivery/read indicators (✓ ✓✓) in the chat UI.

---

### 7.9 — No typing indicators

- No real-time "User is typing..." indicator in chat rooms or DMs.
- This is a basic chat feature that every messaging platform has.

**Fix**: Use a lightweight `chatRooms/{roomId}/typing/{userId}` document with a short TTL. Update on keypress, clear after 3 seconds of inactivity.

---

### 7.10 — No deep linking / Open Graph previews for shared content

- Shared post URLs (e.g., `nextbench.in/post/xyz`) are SPA routes — social media crawlers (Twitter, WhatsApp, Discord) will see an empty `<div id="root">` with generic OG tags.
- No server-side rendering or dynamic OG tag injection for shared content.
- Links shared on other platforms look like "Nextbench — The premiere verified student-to-student marketplace" regardless of what's being shared.

**Fix**: Implement dynamic OG tags via a Vercel Edge Function or Firebase Hosting rewrite. For each shared post/product, inject the title, description, and image into the HTML before it reaches the crawler.

---

### 7.11 — No accessibility (a11y) implementation

- No ARIA labels on interactive elements.
- No keyboard navigation support.
- No screen reader support.
- No focus management in modals and dropdowns.
- `select-none` is applied to the entire app body, preventing text selection everywhere.
- No skip-to-content link.
- No high-contrast mode support.

**Fix**: Audit with axe-core or Lighthouse accessibility audit. Add ARIA labels to all interactive elements. Implement keyboard navigation for modals, menus, and forms. Add focus trapping in modals. Remove the global `select-none`.

---

### 7.12 — No internationalization (i18n)

- All strings are hardcoded in English throughout the codebase.
- No localization framework.
- As the platform grows beyond English-speaking campuses, this becomes a blocker.

**Fix**: Adopt `react-i18next` or similar. Extract all UI strings into translation files. Start with English and Hindi for the current user base.

---

## Execution Priority Matrix

| Priority | Phase | Description | Effort | Impact | Timeline |
|----------|-------|-------------|--------|--------|----------|
| 🔴 P0 | 1.1–1.13 | All security vulnerabilities | High | Critical | **Week 1-2** |
| 🔴 P0 | 2.3 | Remove TensorFlow.js from client | Medium | Very High | **Week 1** |
| 🟠 P1 | 2.1–2.2 | Decompose 2800-line and 1600-line monoliths | High | High | **Week 2-4** |
| 🟠 P1 | 5.1–5.2 | Fix data integrity race conditions | Medium | High | **Week 2-3** |
| 🟡 P2 | 2.4–2.10 | All performance optimizations | High | High | **Week 3-5** |
| 🟡 P2 | 6.1–6.3 | CI/CD, error tracking, analytics | Medium | Medium | **Week 3-4** |
| 🟢 P3 | 3.1–3.7 | Architecture & code quality cleanup | High | Medium | **Week 4-8** |
| 🟢 P3 | 4.1–4.7 | UX bugs and broken interactions | Medium | Medium | **Week 4-6** |
| 🔵 P4 | 7.1–7.12 | Feature parity with flagship apps | Very High | Medium | **Week 6-16** |

---

> **Bottom line**: NextBench has a solid *feature set* and an ambitious vision, but it ships with the security posture of a hackathon project, the performance profile of a prototype, and the architecture of a rapid MVP. None of these are permanent — every issue listed here is fixable. The path to being competitive starts with **Phase 1 (security)** and **Phase 2.3 (removing the 6 MB client-side ML pipeline)**.
