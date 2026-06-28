/**
 * Image Moderation Service
 *
 * Client-side TensorFlow.js / nsfwjs has been removed (Phase 2.3).
 * Moderation is now fully server-side:
 *   • Cloudinary signed-upload preset applies server-side moderation on every upload (Phase 1.5).
 *   • Failed or unavailable checks fail closed on the server — never auto-approve.
 *
 * The public API surface is preserved so call-sites in Feed.tsx require no changes.
 * `checkImageSafety` and `checkAllImagesSafety` now return `{ isSafe: true }` immediately
 * because the actual safety decision is made by Cloudinary's moderation add-on after the
 * upload completes. Posts still go through the "pending → approved" admin review flow.
 *
 * To add a real pre-upload API check in the future, replace the bodies of
 * `checkImageSafety` / `checkAllImagesSafety` with a fetch to `/api/moderate-image`.
 */

// ─── Public Types ───────────────────────────────────────────────────────────

export interface ImageModerationResult {
  /** Whether the image passed moderation (true = safe, false = flagged). */
  isSafe: boolean;
  /** Human-readable reason when the image is flagged. */
  reason?: string;
  /** The highest NSFW confidence score (0–1) detected. */
  confidence?: number;
  /** Raw classification breakdown (useful for debugging / logging). */
  classifications?: Record<string, number>;
  /** Indicates if the safety check failed due to engine unavailability. */
  isUnavailable?: boolean;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Checks whether a single image file is safe for publishing.
 *
 * Server-side moderation (Cloudinary) handles the actual safety decision.
 * This client stub always passes so UX is not blocked; the post enters the
 * "pending" queue and is only approved after server-side moderation confirms safety.
 */
export async function checkImageSafety(_file: File): Promise<ImageModerationResult> {
  return { isSafe: true };
}

/**
 * Checks multiple images in parallel and returns a combined result.
 * All images must pass for the batch to be considered safe.
 */
export async function checkAllImagesSafety(files: File[]): Promise<ImageModerationResult> {
  if (files.length === 0) {
    return { isSafe: true };
  }
  return { isSafe: true };
}

/**
 * No-op: model preloading is no longer needed since TF.js has been removed.
 * Kept for API compatibility — call-sites are not required to be updated.
 */
export function preloadModerationModel(): void {
  // No-op — server-side moderation requires no client preloading.
}
