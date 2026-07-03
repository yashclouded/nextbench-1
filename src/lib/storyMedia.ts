/**
 * Story creation media pipeline: image compression, video metadata + poster capture,
 * capture-mode detection, and publishing (upload + createStory).
 *
 * Pure math lives in `storyMediaMath.ts` (unit-tested); this module holds the DOM/Firebase
 * side. Design: docs/superpowers/specs/2026-07-03-stories-creation-design.md
 */
import { newStoryId, uploadStoryMedia, createStory, type Story } from './stories';
import { isHeicFile, convertHeicToJpeg } from './heic-converter';
import {
  fitDimensions,
  extForBlobType,
  buildCreateStoryInput,
  type StoryDraft,
  type StoryAuthor,
} from './storyMediaMath';

export type { StoryDraft, StoryAuthor } from './storyMediaMath';

// Limits / targets
export const IMAGE_MAX_W = 1080;
export const IMAGE_MAX_H = 1920;
export const IMAGE_QUALITY = 0.85;
export const MAX_VIDEO_MS = 60_000;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** True when we should offer the in-app camera (mobile / touch with getUserMedia). */
export function isMobileCapture(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  const hasCam = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  return coarse && touch && hasCam;
}

/** Whether an in-app camera can be opened at all (permission still resolved at use time). */
export function canUseCamera(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), type, quality);
  });
}

/**
 * Downscale an image to fit within (maxW,maxH) and re-encode as JPEG. HEIC inputs are
 * converted first. Returns the compressed blob + its final pixel dimensions.
 */
export async function compressImage(
  source: File | Blob,
  maxW = IMAGE_MAX_W,
  maxH = IMAGE_MAX_H,
  quality = IMAGE_QUALITY,
): Promise<{ blob: Blob; width: number; height: number }> {
  let input: Blob = source;
  if (source instanceof File && isHeicFile(source)) {
    input = await convertHeicToJpeg(source);
  }

  const url = URL.createObjectURL(input);
  try {
    const img = await loadImage(url);
    const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, maxW, maxH);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas context');
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read a video's intrinsic dimensions and duration. Handles non-finite duration (webm). */
export function getVideoMeta(url: string): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onerror = () => reject(new Error('Failed to load video metadata'));
    v.onloadedmetadata = () => {
      const finish = () =>
        resolve({
          width: v.videoWidth,
          height: v.videoHeight,
          durationMs: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0,
        });
      if (Number.isFinite(v.duration)) {
        finish();
      } else {
        // MediaRecorder webm sometimes reports Infinity until seeked.
        v.onseeked = () => {
          v.onseeked = null;
          finish();
        };
        v.currentTime = 1e101;
      }
    };
    v.src = url;
  });
}

/** Grab a poster frame near the start of a video. */
export function capturePoster(url: string): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.onerror = () => reject(new Error('Failed to load video for poster'));
    v.onloadeddata = () => {
      const seekTo = Math.min(0.1, (Number.isFinite(v.duration) ? v.duration : 1) / 2);
      v.onseeked = async () => {
        v.onseeked = null;
        try {
          const { width, height } = fitDimensions(v.videoWidth, v.videoHeight, IMAGE_MAX_W, IMAGE_MAX_H);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No 2D canvas context');
          ctx.drawImage(v, 0, 0, width, height);
          const blob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
          resolve({ blob, width, height });
        } catch (e) {
          reject(e as Error);
        }
      };
      v.currentTime = seekTo;
    };
    v.src = url;
  });
}

/**
 * Upload the draft's media (+ poster for video) and write the story doc.
 * `onProgress` is coarse (0..1). Returns the created Story.
 */
export async function publishStory(
  draft: StoryDraft,
  author: StoryAuthor,
  onProgress?: (p: number) => void,
): Promise<Story> {
  onProgress?.(0.05);
  const id = newStoryId();
  const ext = extForBlobType(draft.blob.type, draft.mediaType);

  const media = await uploadStoryMedia(draft.blob, author.uid, id, 'media', ext);
  onProgress?.(0.6);

  let poster: { url: string; path: string } | null = null;
  if (draft.mediaType === 'video' && draft.posterBlob) {
    poster = await uploadStoryMedia(draft.posterBlob, author.uid, id, 'poster', 'jpg');
  }
  onProgress?.(0.8);

  const story = await createStory(buildCreateStoryInput(id, media, poster, draft, author));
  onProgress?.(1);
  return story;
}
