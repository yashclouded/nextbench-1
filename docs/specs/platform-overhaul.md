# NextBench Platform Overhaul — Algorithms, Caching & UI/UX Spec

**Date:** 2026-07-12
**Status:** Proposal
**Reality check:** This app is a **Vite 6 + React 19 SPA** (React Router 7, Tailwind v4, Framer Motion) with **Firestore + Cloud Functions + Cloudinary**, deployed on Vercel as a static SPA + 2 serverless functions, wrapped in Capacitor + PWA. It is **not Next.js** — so no ISR/RSC/`next/image`. Every design below is built for *this* stack: Firestore read costs, callable functions, client realtime listeners, CDN-cached static assets.

---

## Table of Contents
1. [Search](#1-search)
2. [Caching Strategy](#2-caching-strategy)
3. [Profile Rating (Reputation)](#3-profile-rating)
4. [Recommendations](#4-recommendations)
5. [Feed Ranking](#5-feed-ranking)
6. [Marketplace Ranking](#6-marketplace-ranking)
7. [Trending + HOT/TRENDING/RISING/NEW Badges](#7-trending--badges)
8. [Skeleton Loading System](#8-skeleton-loading-system)
9. [UI/UX Overhaul Plan](#9-uiux-overhaul-plan)
10. [Phasing & Priorities](#10-phasing--priorities)

---

## 1. Search

### Current state
`searchDiscovery` (functions/src/index.ts:1568) pulls up to ~70 docs and does **in-memory `.includes()` substring matching**. Client (`Search.tsx`) adds a second layer of client-side filtering for clubs. No index, no ranking, no typo tolerance. Cost and quality both degrade as data grows.

### Design: two-tier, Firestore-native first, engine-ready later

**Tier 1 (build now): token-index search in Firestore.**

1. **Denormalized `searchTokens: string[]` field** on `users`, `products`, `posts`, `clubs`, maintained by Firestore triggers (`onWrite`) in Cloud Functions — never by the client (enforce in rules: client writes can't touch `searchTokens`).
   - Tokenization: lowercase → strip diacritics/punctuation → split on whitespace → for each word emit **prefix tokens** of length 2..10 (`"physics"` → `ph, phy, phys, …`). Cap at ~60 tokens/doc (Firestore `array-contains` needs one index; doc size stays small).
   - Fields tokenized, by collection:
     - users: `name`, `username`, `school`
     - products: `title`, `category`, `description` (first 200 chars), `sellerSchool`
     - clubs: `name`, `tags`, `school`
     - posts: `title`, `content` (first 200 chars)
2. **Query path** (extend `searchDiscovery`): split query into words, take the 2 longest, run `where('searchTokens', 'array-contains', longestToken)` per collection with `limit(30)`, then **rank in-memory** (30 docs, not 70 unranked):

   ```
   score = fieldWeight        (title/name hit ×3.0, tag/category ×2.0, description ×1.0)
         × matchQuality       (exact word 1.5, prefix 1.0)
         × locality           (same school ×2.0, same city ×1.3 — reuse trending.ts multipliers)
         × freshness          (products/posts: 1 / (1 + ageDays/14))
         × trust              (verified user ×1.2, reputation ≥4.5 seller ×1.15)
         − penalties          (sold product ×0.3, blocked → drop)
   ```
3. **Query understanding** (keep + extend existing special cases):
   - `@foo` → username range query (already exists)
   - Detected price patterns (`under 500`, `<500`, `₹500`) → products with `price <=` filter
   - Known category words (`books`, `cycle`, `calculator`…) → category-filtered product search boost
   - `#tag` → club tags
4. **Client UX contract** (`Search.tsx`):
   - Keep 400ms debounce; add **request cancellation token** (ignore stale responses by sequence number — currently a fast typist can get out-of-order results).
   - **Recent searches** (localStorage, 10 max) + existing suggestions as the empty state.
   - Results grouped: Top hit → Users → Products → Clubs → Posts; tabs filter, "All" shows top 3 per group.
   - Skeleton rows while in-flight (see §8), never a spinner.

**Tier 2 (when >~20k products or search quality complaints): Typesense Cloud or Algolia**, synced by the same triggers that maintain `searchTokens` (swap the write target). The client API shape (`searchDiscovery(term, filters) → grouped results`) stays identical, so this is a drop-in backend swap. Don't build this now; just keep the callable's response contract stable.

**Why not Algolia now:** the token-index approach costs zero extra infra, works offline via Firestore cache, and at student-campus scale (thousands of docs, not millions) prefix-token search with a ranking layer is indistinguishable from a real engine for 90% of queries.

---

## 2. Caching Strategy

Five layers, cheapest first. Guiding rule for this stack: **Firestore reads are the currency** — every cache exists to avoid a read, and every hot aggregate becomes a materialized doc.

### L1 — CDN / Cloudinary (static + images)
- All Cloudinary URLs must go through `getOptimizedImageUrl()` — audit and enforce (several raw usages exist). Extend it to accept a width param and emit `f_auto,q_auto,w_{w},c_limit,dpr_auto`.
- Add Workbox `CacheFirst` route for `res.cloudinary.com` (30 days, maxEntries 300). Fonts: **self-host Inter + Playfair via `@fontsource`** instead of the render-blocking Google Fonts `@import` in index.css:1 — precached by the PWA, `font-display: swap`.

### L2 — Firestore local cache
- Switch `memoryLocalCache` → `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` in `src/lib/firebase.ts`. This makes every revisit render instantly from IndexedDB while snapshots revalidate — the single biggest "perceived speed" win available, and it's one line. (It was avoided for startup perf; modern persistent cache is lazy — measure, but expect a win, especially in the Capacitor app.)

### L3 — App-level query cache: add TanStack Query
- Adopt `@tanstack/react-query` as the caching layer for **all non-realtime reads** (callable functions: `getDiscoveryFeed`, `searchDiscovery`, `getPublicProfile`, `getProductReviews`, trending doc, suggested users). Realtime surfaces (chat, notifications badge, presence) keep `onSnapshot`.
- Policies:
  - profile/product detail: `staleTime: 60s`, keep previous data on refetch (no spinner on back-nav)
  - feed pages: `staleTime: 30s`, infinite query with cursor
  - trending/suggestions: `staleTime: 5min`
- This also kills the **N+1 reads** in `PostCard`/`ProductCard`/`MessagesLayout`: per-card author fetches become deduped `useQuery(['user', uid])` calls — 40 cards, 1 read per unique author, cached across pages.

### L4 — Materialized aggregates in Firestore (poor-man's Redis, $0)
A single scheduled Cloud Function (`computeDerived`, every 10 min) writes small **computed docs** that clients read with one snapshot each:
- `computed/trending_{school}` — ranked trending posts + products + badge map (see §7)
- `computed/feed_pool_{school}` — top ~200 ranked post/product IDs + scores (see §5)
- `computed/landing_stats` — replaces the on-demand `getLandingStats` counts
- `computed/suggestions_global` — fallback recommendation pool

One doc read replaces N-doc scans per user per session. All are `allow read: if isSignedIn()` (landing_stats public), write server-only.

### L5 — Denormalization (cache-in-the-doc)
- `posts`/`products` already carry `authorName`/`authorProfilePicture`/`sellerName` — **trust them**; remove live per-card author lookups (accept up-to-1-day-stale avatars; a trigger on `users` avatar change can fan-out-update the author's 20 most recent docs).
- Store `width`/`height` on every uploaded image (Cloudinary returns them in the upload response) — required by §8/§9 for zero-CLS rendering. Message docs get `image: {url, w, h}` (keep legacy string support on read).
- Maintain `reviewCount` + `ratingSum` on `users` (trigger on `reviews`) so profile ratings never scan the reviews collection.

### Vercel layer
- `api/send-notification.js` and `api/verify.ts` are uncacheable (auth'd mutations) — leave as-is. `vercel.json`: add `Cache-Control: public, max-age=31536000, immutable` headers for hashed `/assets/*`, and `no-cache` for `index.html` (pairs with the PWA update flow).

---

## 3. Profile Rating

### Current state
`reputation` is a static default (5.0) on `users`; `reviews` exist (`rating`, `comment` per product/seller) but nothing aggregates them, and a naive mean would be gamed instantly (one 5★ from a friend = perfect seller).

### Design: Bayesian composite reputation (0–5, one number, explainable parts)

**Displayed rating = Bayesian-smoothed review average:**

```
R_reviews = (C × m + Σ ratings) / (C + n)
  m = global mean rating across platform (recomputed weekly, seed 4.2)
  C = 5 (prior weight: you need ~5 reviews before your score is "yours")
  n = review count
```
New sellers show "New seller" instead of a number until `n ≥ 3`.

**Composite reputation** (internal, drives ranking boosts in §1/§5/§6):

```
reputation = 0.55 × R_reviews(normalized)
           + 0.20 × completionScore      (sold / (sold + expired + long-stale listings))
           + 0.15 × responsiveness       (fraction of product-chat rooms where seller replied < 24h; from chatRooms lastSenderId/updatedAt trigger)
           + 0.10 × standing             (verified +, account age +, upheld reports −0.5 each, moderation strikes −)
```

**Anti-abuse rules (hard requirements):**
1. A review may only be created by a user who has a `chatRooms` doc of `type: product` for that product with the seller (buyer actually inquired) **and** the product is `sold`/`reserved` to someone. Enforce in `firestore.rules` + a validating trigger.
2. One review per (reviewer, product); reviewer ≠ seller; blocked pairs can't review.
3. **Time decay:** reviews older than 180 days weigh ×0.5 (recomputed in the weekly job).
4. **Reciprocity damping:** if A→B and B→A both rate 5★ within 48h repeatedly (≥3 pairs), damp those pairs to weight ×0.3.
5. Rating changes are recomputed **only by trigger/scheduled function** — `reputation`, `reviewCount`, `ratingSum` are server-only fields in rules.

**Surface:** profile header shows ★4.6 (23) + badges: "Fast responder" (responsiveness ≥0.8), "Trusted seller" (composite ≥4.5 ∧ n≥10), "New seller". Tapping opens the review list (existing `getProductReviews` path, extended to seller-level).

---

## 4. Recommendations

### Design: lightweight affinity profile + candidate pools. No ML infra.

**Per-user affinity doc `user_affinity/{uid}`** (server-written by triggers on wishlist/reaction/vote/follow/product-chat events, exponentially decayed):

```
{
  categories:  { Books: 8.2, Electronics: 3.1, ... },   // product interest
  postTypes:   { confession: 12.4, others: 2.0 },
  schools:     { "XYZ College": 20.1, ... },             // whose content they engage with
  engagedAuthors: { uid: decayedCount, ... }             // top 50 only
}
```
Decay: on each write, `newVal = oldVal × 0.5^(daysSinceUpdate/14) + eventWeight` (wishlist 4, product chat 8, reaction 2, upvote 1, follow 10). Cheap, incremental, one doc.

**Suggested users** (replaces inline scoring in `Search.tsx` / `SuggestedUsers.tsx`):
```
score = 40 × mutualFollows            (follows-of-follows via follow_edges, capped)
      + 30 × sameSchool
      + 10 × sameCity
      + 15 × engagementOverlap        (they engage with authors you engage with)
      +  8 × isActive                 (posted/storied in last 7d)
      −  ∞ × (already following ∨ blocked)
      + jitter(0..5)                   (rotation so the list isn't static)
```
Computed in a callable `getSuggestedUsers` (candidates: same school + follows-of-follows + `computed/suggestions_global` fallback), cached client-side 5 min (L3).

**Recommended products** ("For you" rail in Marketplace + ProductDetail "Similar items"):
```
score = affinity(user.categories[p.category])        normalized 0..1, ×35
      + locality (school ×2 / city ×1.3 — reuse)     ×25
      + demand   (wishlistCount×4 + inquiryCount×8, log-scaled)  ×20
      + freshness 1/(1+ageDays/7)                     ×15
      + sellerReputation/5                            ×5
      − alreadyWishlisted/own/sold → drop
```
Similar-items on ProductDetail is the same formula with `category` fixed and a **price band filter** (0.5×–2× current item's price).

**Cold start:** no affinity doc → school-popular (from `computed/trending_{school}`) → city → global. Never an empty rail.

---

## 5. Feed Ranking

### Current state
`getDiscoveryFeed` returns `createdAt desc` (pure chronological), client mixes in products. `trending.ts` scoring exists but only powers a sidebar.

### Design: two tabs — **For You** (ranked) and **Following** (chronological)

**Following tab:** posts from followed authors + own school stories, strict `createdAt desc`, cursor-paginated. Cheap, predictable, no algorithm complaints. (Requires a `where('authorId','in',…)` batched query or fan-out read from `follow_edges` — cap at 30 followed authors per page batch.)

**For You tab — score (server-side, generalizing `trending.ts`):**

```
engagement = upvotes×3 + reactions(weighted, reuse REACTION weights)×3
           + replies×5 + shares×7 + saves×4
decayed    = engagement / (ageHours + 2)^1.35        (gentler than trending's 1.5 — feed shows a longer tail)
score      = decayed
           × locality        (same school 2.0 / city 1.3 / else 1.0)
           × relationship    (author followed ×2.5; engagedAuthors hit ×1.5)
           × typeAffinity    (user_affinity.postTypes, normalized 0.8..1.4)
           × qualityGates    (moderationFlagged → drop; downvote ratio >40% ×0.3)
```

**Assembly rules (client-side, deterministic):**
- **Author diversity:** max 2 consecutive slots per author, max 3 per page (trending.ts anti-manipulation, applied to feed).
- **Injection slots:** stories row at top (exists); 1 recommended **product card** per 6 posts (from §4); `SuggestedUsers` inline card at slot 8 on mobile (where the right rail doesn't exist).
- **Freshness floor:** ~20% of each page reserved for posts <6h old regardless of score (new content gets a chance; pairs with the NEW badge).

**Serving model (Firestore-cost-aware):**
- `computeDerived` (§2 L4) writes `computed/feed_pool_{school}` every 10 min: top 200 `{id, type, score}` for that school's audience.
- `getDiscoveryFeed` v2: reads the pool doc, hydrates the requested page of docs (20 reads), applies per-user filters (blocks, privacy, relationship multipliers — relationship re-rank happens here since the pool is per-school, not per-user). Cursor = position in pool + a `createdAt` cursor for the chronological freshness stream, merged.
- Realtime layer: client keeps a small `onSnapshot` on newest posts (`createdAt > pageLoadTime`, own school) → shows a **"New posts ↑" pill** instead of shifting the feed (see §9).

---

## 6. Marketplace Ranking

### Current state
`products` sorted `status+createdAt` (newest first). Sold items linger, stale listings clog page 1, demand signals (`wishlistCount`, `inquiryCount`) unused outside the trending sidebar.

### Design

**Default sort "Recommended":**
```
score = freshness            1/(1 + ageDays/10)                       ×30
      + demandVelocity       (wishlistCount×4 + inquiryCount×8) / (ageDays+1), log-scaled  ×25
      + sellerReputation     composite from §3, normalized             ×15
      + listingQuality       (≥2 images +0.5, description ≥80 chars +0.3, price set sanely +0.2)  ×15
      + locality             school ×2 / city ×1.3                     ×15
      − priceOutlier         price > 3× category median → −20
      ; status: sold → demote ×0.1 (visible, badged, sorts last); reserved → ×0.6 (badged "Reserved")
```
Category median prices live in `computed/market_stats` (weekly job).

**Explicit sorts stay honest:** "Newest", "Price ↑/↓" are raw Firestore queries — no algorithm. Filters: category, price range, condition, school-only toggle, hide-sold toggle (default on).

**Lifecycle (missing today, causes staleness):**
- 21 days unsold → notification "still selling? Renew" ; renew resets `bumpedAt` (ranking uses `bumpedAt || createdAt`).
- 45 days no renewal → `status: expired` (hidden from browse/search, seller can relist in one tap). Scheduled function.
- `reserved` for >7 days with no `sold` → auto-nudge both parties.

**ProductDetail additions:** "Similar items" rail (§4), seller reputation block (§3), demand hint ("🔥 12 people wishlisted this") — uses existing counters, drives urgency.

---

## 7. Trending + Badges

### Current state
`src/lib/trending.ts` is genuinely good (weighted engagement, `(h+2)^1.5` decay, velocity tiers, locality multipliers, anti-manipulation) — **keep the math**. Problems: it runs **client-side per session** (every user re-scans and re-scores), labels are percentile-of-current-sample (unstable), and badges aren't visible outside the sidebar.

### Design: server-computed, hysteresis-stable badge taxonomy

**Move scoring into `computeDerived`** (every 10 min): port `trending.ts` pure functions to the Cloud Function, score the last-48h post pool and last-72h product pool **per school**, write `computed/trending_{school}`:

```
{ updatedAt, posts: [{id, score, velocity, badge}], products: [...], badges: { [docId]: 'HOT'|'TRENDING'|'RISING'|'NEW' } }
```
Clients (`useTrending`, feed cards, marketplace cards) read this one doc — consistent badges for everyone, zero client scans.

**Badge taxonomy (posts; products in parens):**

| Badge | Rule | Visual |
|---|---|---|
| **🆕 NEW** | age < 6h (products: < 24h), any engagement | subtle mint pill |
| **📈 RISING** | velocity ≥ 5 engagements/hr ∧ age < 12h ∧ not yet HOT | teal pill |
| **🔥 TRENDING** | score in top 25% of school pool ∧ engagement ≥ 10 ∧ held for ≥ 2 consecutive windows | pink pill |
| **⚡ HOT** | score in top 10% ∧ engagement ≥ 25 (products: wishlist+inquiry weighted ≥ 30) | gradient pill, feed priority |

**Hysteresis (anti-flapping):** a badge is **granted** when the rule holds for 2 consecutive 10-min windows and **revoked** only after failing for 3 windows (store `badgeSince`/`failCount` in the computed doc). Badges are mutually exclusive; highest wins. NEW is exempt from hysteresis (pure age).

**Keep from trending.ts:** min age 5 min, max 2 items/author in any trending list, bot-penalty (high likes + zero comments ×0.5), 48h/72h windows.

**Placement:** badge pill on PostCard/ProductCard (top-right of media), TrendingSidebar (desktop), a horizontal "Trending at {school}" rail in mobile Search empty-state.

---

## 8. Skeleton Loading System

### Current state
`.skeleton` shimmer utility + `PostCardSkeleton` exist, but **15+ surfaces show raw "Loading…" text or a bare spinner** (Profile, ProductDetail, Notifications, Wishlist, ClubChat, ChatRoom, MessagesLayout, AdminPanel, Search…), and the single route-level `Suspense` fallback (App.tsx:44) is a lone teal spinner for every page transition.

### Rules (non-negotiable, enforce in review)
1. **Content areas never show spinners or "Loading…" text.** Spinners are reserved for *user-initiated actions* (button in-flight state, pull-to-refresh, upload progress).
2. Every skeleton **matches the real layout's dimensions** — same card sizes, same aspect ratios — so there is zero shift on swap. Skeletons use the existing `.skeleton` shimmer tokens (dark-mode aware already).
3. Skeletons appear **instantly** (no delay) but persist a **minimum 300ms** once shown (no flash).
4. Cached revisits (L2/L3 in §2) skip skeletons entirely — stale data + background revalidate beats any skeleton.

### Primitives (`src/components/ui/skeleton/`)
`<Skeleton>` (base block), `<SkeletonText lines={n}>`, `<SkeletonAvatar size>`, `<SkeletonImage ratio>`, plus composed units: `PostCardSkeleton` (exists — move here), `ProductCardSkeleton`, `MessageBubbleSkeleton`, `ListRowSkeleton`, `ProfileHeaderSkeleton`, `NotificationRowSkeleton`, `ReviewRowSkeleton`.

### Route-level skeletons (replace the global `PageLoader`)
Wrap each lazy route in its own `Suspense` with a page-shaped fallback; the same fallback doubles as the data-loading state:

| Route | Skeleton composition |
|---|---|
| `/community` (Feed) | Stories bubbles (exists) + 5× PostCardSkeleton (exists — keep) |
| `/marketplace`, `/wishlist` | grid of 8× ProductCardSkeleton (aspect-4/3 image + 2 text lines + price) |
| `/profile*`, `/u/*` | ProfileHeaderSkeleton (cover 3:1 + avatar circle + 2 lines + stats row) + tab bar + content grid |
| `/product/:id` | square image block + title/price lines + seller row + button block |
| `/messages` | 8× ListRowSkeleton (avatar + 2 lines) left; empty-state right (desktop) |
| chat panel open | 6× MessageBubbleSkeleton alternating alignment, widths 40–70% |
| `/notifications` | 8× NotificationRowSkeleton |
| `/search` (in-flight) | grouped ListRowSkeletons under tab bar |
| `/club/:id` | header row + MessageBubbleSkeletons |

### CLS companion rules (skeletons don't help if content shifts after load)
- All images render inside **aspect-ratio-reserving containers** (`aspect-[w/h]` from stored dimensions, §2 L5) with Cloudinary **LQIP blur placeholder** (`w_24,e_blur:400,q_30` background image → swap on load).
- Feed virtualizer (`Feed.tsx:1388`): with reserved ratios, `estimateSize` becomes accurate → no scroll jumps.

---

## 9. UI/UX Overhaul Plan

### 9.0 Foundation — design-system hardening (prerequisite for everything)
- **Token discipline:** eliminate arbitrary values (`max-h-300px`, `pb-64px`, `w-72px`, `md:w-112.5`, hex colors in bubble/voice CSS) — map to `@theme` tokens in index.css. Fix the dangling `--font-reading` token. Standardize radius scale: `rounded-xl` (inputs/chips) / `rounded-2xl` (cards) / `rounded-3xl` (modals) — nothing else.
- **Primitives:** keep bespoke components (no shadcn migration — too invasive), but extract shared primitives: `<Button>` (variants via `cva`), `<Sheet>` (bottom sheet mobile / side panel desktop), `<Dialog>`, `<SmartImage>`, `<Lightbox>`. Build on Radix primitives for focus-trap/a11y where dialogs are involved.
- **`<SmartImage>`** — the single image component, used everywhere:
  - props: `src, w, h (stored dims), ratio?, fit, sizes, priority?`
  - renders aspect-reserving wrapper + Cloudinary `srcset` (`w_320/640/960/1280` + `dpr_auto`) + LQIP blur-up + `loading="lazy"` (unless priority) + graceful broken-image fallback.
  - Non-Cloudinary sources (Firebase Storage videos posters, Google avatars) pass through with dims only.
- **`<Lightbox>`** — one global viewer (replaces 3 per-surface copies in ChatRoom/ClubChat/ProductDetail): pinch-zoom + double-tap zoom, swipe-down dismiss, swipe between images in a set, download/share actions, respects safe areas. Mounted once at app root, opened via context.
- **A11y & polish:** remove global `select-none` (App.tsx:132) — apply only to nav chrome; visible focus rings via tokens; keep the existing reduced-motion handling.
- **Fonts:** self-host (§2 L1), kill the render-blocking `@import`.

### 9.1 Chat overhaul (the jank epicenter)
Unify `ChatRoom.tsx` (1132 lines) + `ClubChat.tsx` (706 lines) into one engine + thin adapters:

```
<ChatView>                      — layout: header / MessageList / composer
  useChatEngine(source)         — subscription, pagination, send queue, read receipts
  <MessageList>                 — virtualized, bottom-anchored
  <MessageBubble>               — text/image/voice/shared-post/reply variants
  <Composer>                    — MentionInput + attachments + voice (reuse existing pieces)
adapters: useDmSource(roomId) | useClubSource(clubId)   — queries, permissions (slow mode, leads-only), read model
```

**MessageList requirements (kills the current hacks):**
- **Virtualized** with `@tanstack/react-virtual` (already a dependency), **bottom-anchored**: initial render pinned to bottom, reverse-infinite scroll upward.
- **Pagination:** initial `limit(50)` + "load older" cursor pages of 50 (fixes the hard 100-message ceiling — history is currently unreachable). Realtime listener only on `createdAt > mountTime` merged with paged history.
- **Scroll anchoring contract** (replaces the `setInterval(scrollToBottom, 50)` polling in ChatRoom.tsx:212 / ClubChat.tsx:117):
  - user at bottom (≤80px) → new messages auto-scroll (smooth)
  - user scrolled up → position preserved exactly; floating **"↓ N new messages" pill**
  - own sent message → always scroll to bottom
  - image bubbles have **reserved dimensions** (stored `w/h`, §2 L5) → no reflow → no `onLoad` re-scroll hack needed
- **Bubbles:** entry animation only on genuinely-new messages (not on page/history render — currently every bubble animates); image bubbles use `<SmartImage>` capped at `min(w, 280px)` × ratio-derived height, tap → global `<Lightbox>`; keep gradient-border bubble styling but tokenized.
- **Optimistic send:** message appears instantly with pending state (clock icon) → confirmed/failed (retry affordance). Currently sends round-trip through Firestore before appearing.
- **Effects hygiene:** split the single mega-effect (subscription + mark-read `writeBatch` + notification cleanup, ChatRoom.tsx:166–201) into three; mark-read debounced to visibility (document focused + at bottom).
- **Router-driven panels:** replace manual `window.history.pushState` (MessagesLayout.tsx:226/667) with real routes — `/messages` (list) and `/messages/:roomId` (list+panel ≥lg, full-screen <lg). Back button just works.
- **Delete dead code:** `ChatList.tsx` (674 lines), `MessagesShell.tsx`.

### 9.2 Image handling end-to-end
- **Upload pipeline:** every `uploadToCloudinary` call site stores `{url, w, h}` (response already includes dimensions) — messages, posts, products, stories, avatars. Legacy string URLs remain readable (ratio falls back to a per-context default: 4/3 products, 1/1 avatars, 3/4 chat).
- **Cropping — enforce per-context ratios via the existing `ImageCropper`:** avatar 1:1 circle-masked; cover 3:1; product images free-crop with 4:3 frame guide; post images optional crop (16:9 / 4:5 / original presets); story 9:16. One cropper, ratio passed by context.
- **Display normalization:**
  - Product cards: `aspect-4/3` + **`object-cover`** (currently `object-contain` letterboxes, ProductCard.tsx:151); detail view keeps `object-contain` inside the gallery (buyers need the full item) with blurred cover backdrop fill.
  - Feed post images: reserved ratio via SmartImage (fixes PostCard.tsx:434 `h-auto` reflow → fixes the virtualizer, §8).
  - Multi-image posts/products: 2-up / 3-up grid layouts with `+N` overflow tile → Lightbox set.
  - All avatars through one `<Avatar size>` component (SmartImage + fallback initials) — today sizes and fallbacks vary per surface.

### 9.3 Responsive layout contract (mobile / tablet / desktop)
Define the contract explicitly (today 768–1024px is a dead zone: icon-rail, no right rail, no bottom nav):

| Range | Nav | Columns | Messages |
|---|---|---|---|
| **<768 (mobile)** | Bottom tab bar + MobileHeader on **all** dashboard pages (fix the whitelist — most pages currently have no header/back affordance) | 1 | full-screen chat route |
| **768–1119 (tablet)** | **Icon rail (72px) + bottom nav removed is wrong → keep the rail, add labels-on-hover; right rail stays hidden but `RightSidebarDrawer` gets a trigger button** | 1.5 (rail + fluid content, content max-w-2xl centered) | 2-pane from **900px** (not 768 — two cramped panes at 768 is worse than one good one) |
| **≥1120 (desktop)** | Expanded sidebar (240px) from **1120** (today `xl`/1280 — the 1024–1280 band feels broken) | 3 (rail + content + right rail from 1200) | 2-pane |
| **All** | `100dvh` + `env(safe-area-inset-*)` everywhere (chat composer, bottom nav — partially done via `pb-safe`) | | |

- Marketplace grid: 2 cols mobile / 3 tablet / 4 desktop, container-query driven (`@container`) so the grid responds to the *column*, not the viewport.
- `SmartHome` auth flash (App.tsx:59): while auth resolves, render a neutral shell skeleton (logo bar + feed skeleton) instead of swapping landing↔dashboard chrome after the fact.
- Feed content column: cap at `max-w-xl` on desktop (reading measure), don't stretch.

### 9.4 Motion & micro-interaction rules
- Motion budget: entry animations only for *new* content (toast, incoming message, badge grant); never on scroll-into-view of existing history or paginated content.
- Page transitions: none (SPA snappiness beats fades); panel/sheet transitions 200–250ms ease-out.
- Keep `layoutId` active-pill nav animation — it's good.

---

## 10. Phasing & Priorities

Ordered by user-visible impact ÷ effort. Each phase ships independently.

| Phase | Scope | Key wins |
|---|---|---|
| **P0 — Perceived speed** (small) | §2 L2 persistent cache, §8 skeleton primitives + route skeletons for Feed/Marketplace/Profile/ProductDetail/Messages, self-hosted fonts, `SmartHome` shell fix | Every screen stops flashing spinners; revisits render instantly |
| **P1 — Chat rebuild** (large) | §9.1 in full: unified ChatView, virtualization, pagination, scroll contract, optimistic send, dead-code deletion; §9.2 stored image dims for messages; global Lightbox | The single biggest "this app feels broken" fix |
| **P2 — Images & CLS** (medium) | `<SmartImage>` everywhere, srcset/LQIP, cropper ratio contract, product-card object-cover, feed ratio reservation → stable virtualizer | Zero layout shift; feed scroll becomes smooth |
| **P3 — Server-side ranking** (medium) | §2 L4 `computeDerived`, §7 trending+badges server-side, §5 feed pools + For You/Following tabs, `getDiscoveryFeed` v2 | Consistent HOT/TRENDING/NEW everywhere; ranked feed |
| **P4 — Search & discovery** (medium) | §1 token index + ranked `searchDiscovery`, recent searches, cancellation; §4 affinity docs + suggested users/products | Search actually finds things; personalized rails |
| **P5 — Marketplace & reputation** (medium) | §6 recommended sort + lifecycle jobs, §3 rating pipeline + anti-abuse rules + profile badges | Trust layer; fresh marketplace |
| **P6 — Responsive contract + polish** (medium) | §9.3 tablet layout, breakpoint moves, MobileHeader everywhere, TanStack Query adoption (§2 L3) finishing N+1 cleanup, token audit (§9.0) | Tablet stops being a dead zone; codebase consistency |

**Cross-cutting guardrails:**
- Every server-computed field (`searchTokens`, `reputation`, badges, pools) is **client-write-denied in `firestore.rules`**.
- Every new scheduled/trigger function logs read/write counts — Firestore cost is the budget; the materialized-doc pattern (§2 L4) is the escape hatch whenever a feature would scan per-user.
- Response contracts of existing callables stay backward-compatible (Capacitor app in the field can't be force-updated).
