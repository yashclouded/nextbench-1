/**
 * Image Moderation Service
 * 
 * Abstraction layer for NSFW image detection. Currently uses client-side
 * TensorFlow.js (nsfwjs) for zero-cost moderation. Designed to be easily
 * swapped to a backend API (e.g., Google Cloud Vision, AWS Rekognition,
 * or a Cloudinary webhook) by changing the `checkImageSafety` function.
 * 
 * ─── To migrate to a backend solution ───
 * Replace the body of `checkImageSafety` with a fetch call:
 * 
 *   export async function checkImageSafety(file: File): Promise<ImageModerationResult> {
 *     const formData = new FormData();
 *     formData.append('image', file);
 *     const res = await fetch('/api/moderate-image', { method: 'POST', body: formData });
 *     return res.json();
 *   }
 * 
 * Everything else in the app stays the same.
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
}

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Thresholds for each NSFW category.
 * If any category's prediction exceeds its threshold the image is flagged.
 * Adjust these to be stricter (lower) or more lenient (higher).
 */
const NSFW_THRESHOLDS: Record<string, number> = {
  Porn: 0.85,
  Hentai: 0.85,
  Sexy: 0.90,     // Slightly more lenient for suggestive but non-explicit content
};

/**
 * Categories that are always considered safe.
 * (We skip checking these entirely.)
 */
const SAFE_CATEGORIES = new Set(['Drawing', 'Neutral']);

// ─── NSFWJS Model Singleton ─────────────────────────────────────────────────

let modelPromise: Promise<any> | null = null;

/**
 * Lazily loads and caches the NSFWJS model.
 * The model is loaded from the default CDN hosted by nsfwjs (~4 MB quantized).
 * This only runs once per session; subsequent calls return the cached model.
 */
async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        // Dynamic import to keep the initial bundle lean.
        // TensorFlow.js and nsfwjs are loaded only when image moderation is needed.
        const nsfwjs = await import('nsfwjs');
        // Use the MobileNet v2 quantized model (smallest, ~4 MB).
        const model = await nsfwjs.load('MobileNetV2Mid', { size: 299 });
        return model;
      } catch (err) {
        // Reset so the next call retries instead of caching a failed promise.
        modelPromise = null;
        throw err;
      }
    })();
  }
  return modelPromise;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Creates an HTMLImageElement from a File and waits for it to load.
 */
function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Checks whether a single image file is safe for publishing.
 * 
 * This is the **only function the rest of the app should call**.
 * Swap its implementation to migrate from client-side to server-side moderation.
 */
export async function checkImageSafety(file: File): Promise<ImageModerationResult> {
  try {
    const [model, img] = await Promise.all([getModel(), fileToImage(file)]);
    const predictions: Array<{ className: string; probability: number }> = await model.classify(img);

    // Build a readable map of all class scores.
    const classifications: Record<string, number> = {};
    for (const p of predictions) {
      classifications[p.className] = Math.round(p.probability * 1000) / 1000;
    }

    // Check each non-safe category against its threshold.
    for (const p of predictions) {
      if (SAFE_CATEGORIES.has(p.className)) continue;

      const threshold = NSFW_THRESHOLDS[p.className];
      if (threshold !== undefined && p.probability >= threshold) {
        return {
          isSafe: false,
          reason: `Image flagged as "${p.className}" (${(p.probability * 100).toFixed(1)}% confidence)`,
          confidence: p.probability,
          classifications,
        };
      }
    }

    return { isSafe: true, classifications };
  } catch (err) {
    console.error('[imageModeration] NSFW check failed, auto-approving to prevent false flags:', err);
    // If the model fails to load (e.g. adblocker blocking the CDN, CORS issue), we fail open
    // so that normal users aren't penalized and have their images blocked.
    return {
      isSafe: true,
      reason: 'Image moderation unavailable — auto-approved.',
      confidence: undefined,
    };
  }
}

/**
 * Checks multiple images in parallel and returns a combined result.
 * All images must pass for the batch to be considered safe.
 */
export async function checkAllImagesSafety(files: File[]): Promise<ImageModerationResult> {
  if (files.length === 0) {
    return { isSafe: true };
  }

  const results = await Promise.all(files.map(checkImageSafety));

  // Find the first flagged result.
  const flagged = results.find(r => !r.isSafe);
  if (flagged) {
    return flagged;
  }

  // All clear — merge the classifications from the first image for reference.
  return {
    isSafe: true,
    classifications: results[0]?.classifications,
  };
}

/**
 * Preloads the NSFW model in the background.
 * Call this early (e.g., when the post modal opens) so the model is ready
 * by the time the user hits "Post". This avoids a cold-start delay.
 */
export function preloadModerationModel(): void {
  getModel().catch(() => {
    // Silently ignore — the model will retry on the actual check.
  });
}
