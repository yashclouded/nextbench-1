/**
 * Stories — Phase 1 foundation client library.
 *
 * Single source of truth for Story data types AND the read/write API that the
 * Stories row (Phase 2), viewer (Phase 2), and creation/editor (Phase 3) build on.
 *
 * Design: docs/superpowers/specs/2026-07-02-stories-foundation-design.md
 *
 * Key invariants:
 *  - A story is "active" iff `status === 'active'` AND `createdAt > now - 24h`.
 *    Expiry is derived from createdAt (kept-forever archive model); nothing is deleted.
 *  - Overlays (`layers`) are stored as structured data with NORMALIZED (0..1)
 *    coordinates and render dynamically at view time — never baked into the media.
 *  - View docs are keyed by viewer uid → each viewer counts once.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  getCountFromServer,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';

// ─── Constants (shared with later phases) ────────────────

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const IMAGE_DEFAULT_DURATION_MS = 5000;
export const MAX_LAYERS = 30;

/** Firestore `in` queries accept at most 10 values per query. */
const IN_CHUNK = 10;

// ─── Types ───────────────────────────────────────────────

export type StoryPrivacy = 'public' | 'followers' | 'closeFriends';
export type StoryMediaType = 'image' | 'video';
export type StoryStatus = 'active' | 'removed';

/** Base fields shared by every overlay layer. Coordinates are NORMALIZED 0..1. */
export interface LayerBase {
  id: string;
  type: string;
  /** center-x, 0..1 relative to the media box (resolution-independent) */
  x: number;
  /** center-y, 0..1 */
  y: number;
  /** rotation in degrees */
  rotation: number;
  /** uniform scale multiplier */
  scale: number;
  /** stacking order */
  z: number;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  fontFamily: string;
  color: string;
  backgroundColor?: string | null;
  align: 'left' | 'center' | 'right';
  /** font size as a fraction of render width (resolution-independent) */
  fontSize: number;
}

/**
 * The overlay union. Widens as sticker types land in later phases
 * (PollLayer | QuestionLayer | MentionLayer | GifLayer | ...), each extending
 * LayerBase with a distinct `type` — no migration of existing data required.
 */
export type Layer = TextLayer;

export interface Story {
  id: string;
  authorId: string;
  authorUsername: string;
  authorPhotoURL: string | null;
  mediaType: StoryMediaType;
  mediaUrl: string;
  mediaPath: string;
  posterUrl: string | null;
  posterPath: string | null;
  width: number;
  height: number;
  durationMs?: number;
  layers: Layer[];
  privacy: StoryPrivacy;
  status: StoryStatus;
  /** epoch ms */
  createdAt: number;
  /** epoch ms (createdAt + 24h) */
  expiresAt: number;
}

/** One author's grouped stories + ring state, as rendered in the tray. */
export interface TrayEntry {
  authorId: string;
  username: string;
  photoURL: string | null;
  /** chronological (oldest → newest) — the order the viewer plays them */
  stories: Story[];
  /** true → colored ring; false → gray ring */
  hasUnseen: boolean;
  /** epoch ms of the newest story (for ordering) */
  latestCreatedAt: number;
}

export interface StoryViewer {
  viewerId: string;
  firstViewedAt: Date;
  lastViewedAt: Date;
}

export interface CreateStoryInput {
  /** optional pre-generated id (use `newStoryId()` so media can be uploaded first) */
  id?: string;
  authorId: string;
  authorUsername: string;
  authorPhotoURL?: string | null;
  mediaType: StoryMediaType;
  mediaUrl: string;
  mediaPath: string;
  posterUrl?: string | null;
  posterPath?: string | null;
  width: number;
  height: number;
  durationMs?: number;
  layers?: Layer[];
  privacy?: StoryPrivacy;
}

// ─── Internal helpers ────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toMillis(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return 0;
}

function toDate(v: unknown): Date {
  return new Date(toMillis(v));
}

function storyFromSnap(snap: QueryDocumentSnapshot<DocumentData>): Story {
  const d = snap.data();
  const createdAt = toMillis(d.createdAt);
  return {
    id: snap.id,
    authorId: d.authorId,
    authorUsername: d.authorUsername ?? '',
    authorPhotoURL: d.authorPhotoURL ?? null,
    mediaType: d.mediaType,
    mediaUrl: d.mediaUrl,
    mediaPath: d.mediaPath,
    posterUrl: d.posterUrl ?? null,
    posterPath: d.posterPath ?? null,
    width: d.width ?? 0,
    height: d.height ?? 0,
    ...(d.durationMs != null ? { durationMs: d.durationMs } : {}),
    layers: Array.isArray(d.layers) ? (d.layers as Layer[]) : [],
    privacy: d.privacy ?? 'public',
    status: d.status ?? 'active',
    createdAt,
    expiresAt: d.expiresAt != null ? toMillis(d.expiresAt) : createdAt + STORY_TTL_MS,
  };
}

/** Timestamp cutoff below which a story is expired. */
function activeCutoff(): Timestamp {
  return Timestamp.fromMillis(Date.now() - STORY_TTL_MS);
}

// ─── IDs & storage contract ──────────────────────────────

/** Reserve a story id up front so media can be uploaded to its path before the doc is written. */
export function newStoryId(): string {
  return doc(collection(db, 'stories')).id;
}

/**
 * Uploads already-processed story media to the canonical Storage path and returns
 * its download URL + object path. Compression / poster-frame capture happen in the
 * caller (Phase 3); this only fixes the storage contract.
 *
 * Path: `stories/{authorId}/{storyId}/{kind}.{ext}`
 */
export async function uploadStoryMedia(
  file: Blob,
  authorId: string,
  storyId: string,
  kind: 'media' | 'poster',
  ext: string,
): Promise<{ url: string; path: string }> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized (check VITE_FIREBASE_STORAGE_BUCKET).');
  }
  const path = `stories/${authorId}/${storyId}/${kind}.${ext}`;
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, file, { contentType: file.type || undefined });
  const url = await getDownloadURL(objectRef);
  return { url, path };
}

// ─── Create / mutate ─────────────────────────────────────

export async function createStory(input: CreateStoryInput): Promise<Story> {
  const id = input.id ?? newStoryId();
  const expiresAt = Timestamp.fromMillis(Date.now() + STORY_TTL_MS);
  const layers = (input.layers ?? []).slice(0, MAX_LAYERS);

  const payload: Record<string, unknown> = {
    authorId: input.authorId,
    authorUsername: input.authorUsername,
    authorPhotoURL: input.authorPhotoURL ?? null,
    mediaType: input.mediaType,
    mediaUrl: input.mediaUrl,
    mediaPath: input.mediaPath,
    posterUrl: input.posterUrl ?? null,
    posterPath: input.posterPath ?? null,
    width: input.width,
    height: input.height,
    layers,
    privacy: input.privacy ?? 'public',
    status: 'active',
    createdAt: serverTimestamp(),
    expiresAt,
  };
  if (input.durationMs != null) payload.durationMs = input.durationMs;

  const storyRef = doc(db, 'stories', id);
  await setDoc(storyRef, payload);

  // Read back so createdAt reflects the resolved server timestamp.
  const saved = await getDoc(storyRef);
  return storyFromSnap(saved as QueryDocumentSnapshot<DocumentData>);
}

/** Soft-remove (moderation / user hide). Keeps the archive intact. */
export async function setStoryStatus(storyId: string, status: StoryStatus): Promise<void> {
  await updateDoc(doc(db, 'stories', storyId), { status });
}

/**
 * Hard-delete the story document (owner-initiated). Note: the `views` subcollection
 * and Storage objects are not cascade-deleted here — that belongs to a later cleanup
 * path if needed. Prefer `setStoryStatus('removed')` for reversible hiding.
 */
export async function deleteStory(storyId: string): Promise<void> {
  await deleteDoc(doc(db, 'stories', storyId));
}

// ─── Read: tray & per-user ───────────────────────────────

async function fetchActiveStoriesForAuthors(authorIds: string[]): Promise<Story[]> {
  const cutoff = activeCutoff();
  const ids = Array.from(new Set(authorIds)).filter(Boolean);
  if (ids.length === 0) return [];

  const results = await Promise.all(
    chunk(ids, IN_CHUNK).map(async (group) => {
      const q = query(
        collection(db, 'stories'),
        where('authorId', 'in', group),
        where('createdAt', '>', cutoff),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map(storyFromSnap);
    }),
  );

  // status filtered client-side to keep the composite index minimal.
  return results.flat().filter((s) => s.status === 'active');
}

/**
 * Assemble the current user's stories tray: self + followed authors who have active
 * stories, grouped by author with ring state, ordered self → unseen → seen (by recency).
 */
export async function getStoriesTray(
  currentUid: string,
  followingIds: string[],
): Promise<TrayEntry[]> {
  const [stories, seen] = await Promise.all([
    fetchActiveStoriesForAuthors([currentUid, ...followingIds]),
    getSeenState(currentUid),
  ]);

  const byAuthor = new Map<string, Story[]>();
  for (const s of stories) {
    const list = byAuthor.get(s.authorId) ?? [];
    list.push(s);
    byAuthor.set(s.authorId, list);
  }

  const entries: TrayEntry[] = [];
  for (const [authorId, list] of byAuthor) {
    list.sort((a, b) => a.createdAt - b.createdAt); // chronological playback order
    const latest = list[list.length - 1];
    const lastSeenAt = seen[authorId]?.lastSeenAt ?? 0;
    entries.push({
      authorId,
      username: latest.authorUsername,
      photoURL: latest.authorPhotoURL,
      stories: list,
      hasUnseen: latest.createdAt > lastSeenAt,
      latestCreatedAt: latest.createdAt,
    });
  }

  // Ordering: self first, then unseen by recency, then seen by recency.
  // (Close Friends is a future insert point between self and unseen.)
  entries.sort((a, b) => {
    if (a.authorId === currentUid) return -1;
    if (b.authorId === currentUid) return 1;
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return b.latestCreatedAt - a.latestCreatedAt;
  });

  return entries;
}

/** All of one author's active stories, chronological (for direct-open / preloading). */
export async function getUserActiveStories(authorId: string): Promise<Story[]> {
  const list = await fetchActiveStoriesForAuthors([authorId]);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

// ─── Seen state (ring) ───────────────────────────────────

export interface SeenEntry {
  lastSeenAt: number;
  lastSeenStoryId: string;
}

function seenDocRef(uid: string) {
  return doc(db, 'users', uid, 'private', 'storySeen');
}

export async function getSeenState(uid: string): Promise<Record<string, SeenEntry>> {
  const snap = await getDoc(seenDocRef(uid));
  const raw = (snap.data()?.seen ?? {}) as Record<string, { lastSeenAt: unknown; lastSeenStoryId: string }>;
  const out: Record<string, SeenEntry> = {};
  for (const [authorId, entry] of Object.entries(raw)) {
    out[authorId] = { lastSeenAt: toMillis(entry.lastSeenAt), lastSeenStoryId: entry.lastSeenStoryId };
  }
  return out;
}

/** Record that `uid` has seen up to `latestStoryId` from `authorId`. Deep-merges the map. */
export async function markAuthorSeen(
  uid: string,
  authorId: string,
  latestStoryId: string,
  latestCreatedAt: Date,
): Promise<void> {
  await setDoc(
    seenDocRef(uid),
    { seen: { [authorId]: { lastSeenAt: Timestamp.fromDate(latestCreatedAt), lastSeenStoryId: latestStoryId } } },
    { merge: true },
  );
}

// ─── Views ───────────────────────────────────────────────

function viewRef(storyId: string, viewerId: string) {
  return doc(db, 'stories', storyId, 'views', viewerId);
}

/**
 * Record a view by the current user. Idempotent per viewer: first call creates the doc,
 * subsequent calls only bump `lastViewedAt`. The owner's self-views must not be recorded
 * (also rule-enforced) — pass the story's authorId to short-circuit.
 */
export async function recordStoryView(
  storyId: string,
  viewerId: string,
  authorId: string,
): Promise<void> {
  if (!viewerId || viewerId === authorId) return;
  const vRef = viewRef(storyId, viewerId);
  const existing = await getDoc(vRef);
  if (existing.exists()) {
    await updateDoc(vRef, { lastViewedAt: serverTimestamp() });
  } else {
    await setDoc(vRef, {
      viewerId,
      firstViewedAt: serverTimestamp(),
      lastViewedAt: serverTimestamp(),
    });
  }
}

/** Owner-only: the list of unique viewers for a story. */
export async function getStoryViewers(storyId: string): Promise<StoryViewer[]> {
  const snap = await getDocs(collection(db, 'stories', storyId, 'views'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        viewerId: d.id,
        firstViewedAt: toDate(data.firstViewedAt),
        lastViewedAt: toDate(data.lastViewedAt),
      };
    })
    .sort((a, b) => b.lastViewedAt.getTime() - a.lastViewedAt.getTime());
}

/** Owner-only: total unique view count via server-side aggregation (no counter to drift). */
export async function getStoryViewCount(storyId: string): Promise<number> {
  const agg = await getCountFromServer(collection(db, 'stories', storyId, 'views'));
  return agg.data().count;
}

// ─── Likes ───────────────────────────────────────────────

function likeRef(storyId: string, userId: string) {
  return doc(db, 'stories', storyId, 'likes', userId);
}

/** Toggle like on a story. Returns the new liked state. */
export async function toggleStoryLike(storyId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const lRef = likeRef(storyId, userId);
  const existing = await getDoc(lRef);
  if (existing.exists()) {
    await deleteDoc(lRef);
    return false;
  } else {
    await setDoc(lRef, {
      userId,
      createdAt: serverTimestamp(),
    });
    return true;
  }
}

/** Check if a user has liked a story. */
export async function hasLikedStory(storyId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const snap = await getDoc(likeRef(storyId, userId));
  return snap.exists();
}

/** Get total like count for a story. */
export async function getStoryLikeCount(storyId: string): Promise<number> {
  const agg = await getCountFromServer(collection(db, 'stories', storyId, 'likes'));
  return agg.data().count;
}

// ─── Replies (DM-style messages on stories) ──────────────

export interface StoryReply {
  id: string;
  storyId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: number;
}

/**
 * Send a text reply to a story. Creates a doc in the `stories/{storyId}/replies` subcollection.
 * The story owner can see these in a future "Replies" sheet.
 */
export async function sendStoryReply(
  storyId: string,
  authorId: string,
  authorUsername: string,
  content: string,
): Promise<void> {
  if (!content.trim()) return;
  const repliesCol = collection(db, 'stories', storyId, 'replies');
  await addDoc(repliesCol, {
    storyId,
    authorId,
    authorUsername,
    content: content.trim(),
    createdAt: serverTimestamp(),
  });
}
