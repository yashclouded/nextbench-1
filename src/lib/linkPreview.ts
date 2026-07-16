/**
 * Client wrapper for the getLinkPreview Cloud Function (Chat Phase 4).
 *
 * Detects the first URL in a message and resolves an OpenGraph preview via the
 * server-side callable (the browser can't fetch third-party pages due to CORS).
 * An in-memory cache dedupes concurrent/repeat lookups within the session so a
 * message scrolling in and out of the virtualized list doesn't re-fetch.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// Matches the URL half of LinkifiedText's regex (http(s):// or www.).
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

/** The first URL in a text message, normalized to include a scheme, or null. */
export function firstUrl(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  if (!m) return null;
  const raw = m[1];
  return raw.startsWith('http') ? raw : `https://${raw}`;
}

type Resolved = LinkPreview | null;
const cache = new Map<string, Promise<Resolved>>();

const callable = httpsCallable<{ url: string }, LinkPreview & { cached?: boolean; error?: string }>(
  functions,
  'getLinkPreview'
);

/**
 * Resolve a preview for a URL. Returns null when the server has no preview
 * (unreachable page, blocked host, no OG tags). Never throws.
 */
export function getLinkPreview(url: string): Promise<Resolved> {
  const existing = cache.get(url);
  if (existing) return existing;

  const p = callable({ url })
    .then((res) => {
      const data = res.data;
      if (!data || data.error) return null;
      // A preview with no title AND no image isn't worth a card.
      if (!data.title && !data.image) return null;
      return {
        url: data.url || url,
        title: data.title,
        description: data.description,
        image: data.image,
        siteName: data.siteName,
      } as LinkPreview;
    })
    .catch(() => null);

  cache.set(url, p);
  return p;
}
