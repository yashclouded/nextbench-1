/**
 * Chat video preparation (Chat Phase 4).
 *
 * Validates a picked video against the shared story limits and captures a
 * poster frame, reusing the story media pipeline's canvas helpers (do NOT
 * duplicate the capture logic — it lives in storyMedia.ts and is unit-tested
 * via the story suites).
 */

import { getVideoMeta, capturePoster, MAX_VIDEO_MS, MAX_VIDEO_BYTES } from './storyMedia';

export interface PreparedChatVideo {
  file: File;
  posterBlob: Blob;
  width: number;
  height: number;
  durationMs: number;
}

/**
 * Validate size/duration and capture a poster frame. Throws an Error with a
 * user-facing message on rejection (caller toasts it).
 */
export async function prepareChatVideo(file: File): Promise<PreparedChatVideo> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(`Video must be under ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB`);
  }

  const url = URL.createObjectURL(file);
  try {
    const meta = await getVideoMeta(url);
    if (meta.durationMs > MAX_VIDEO_MS) {
      throw new Error(`Video must be ${Math.round(MAX_VIDEO_MS / 1000)}s or shorter`);
    }
    const poster = await capturePoster(url);
    return {
      file,
      posterBlob: poster.blob,
      width: meta.width || poster.width,
      height: meta.height || poster.height,
      durationMs: meta.durationMs,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
