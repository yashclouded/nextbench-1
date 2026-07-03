/**
 * Pure (no DOM, no Firebase) helpers for the story creation pipeline, split out so they
 * can be unit-tested in node. Types are imported type-only (erased at runtime).
 */
import type { CreateStoryInput, Layer, StoryMediaType, StoryPrivacy } from './stories';

/** Scale (w,h) down to fit within (maxW,maxH), preserving aspect. Never upscales. */
export function fitDimensions(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const ratio = Math.min(1, maxW / w, maxH / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

/** File extension for a blob MIME type, falling back to a sensible default per media type. */
export function extForBlobType(type: string, mediaType: StoryMediaType): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  return map[type] ?? (mediaType === 'video' ? 'mp4' : 'jpg');
}

export interface StoryDraft {
  blob: Blob;
  objectUrl: string;
  mediaType: StoryMediaType;
  width: number;
  height: number;
  durationMs?: number;
  posterBlob?: Blob | null;
  layers: Layer[];
  privacy: StoryPrivacy;
}

export interface StoryAuthor {
  uid: string;
  username: string;
  photoURL: string | null;
}

/** Map a finished draft + uploaded URLs into the createStory() payload. */
export function buildCreateStoryInput(
  id: string,
  media: { url: string; path: string },
  poster: { url: string; path: string } | null,
  draft: Pick<StoryDraft, 'mediaType' | 'width' | 'height' | 'durationMs' | 'layers' | 'privacy'>,
  author: StoryAuthor,
): CreateStoryInput {
  return {
    id,
    authorId: author.uid,
    authorUsername: author.username,
    authorPhotoURL: author.photoURL,
    mediaType: draft.mediaType,
    mediaUrl: media.url,
    mediaPath: media.path,
    posterUrl: poster?.url ?? null,
    posterPath: poster?.path ?? null,
    width: draft.width,
    height: draft.height,
    durationMs: draft.durationMs,
    layers: draft.layers,
    privacy: draft.privacy,
  };
}
