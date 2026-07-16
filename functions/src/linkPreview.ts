/**
 * getLinkPreview — SSRF-hardened OpenGraph link-preview fetcher (Chat Phase 4).
 *
 * The browser can't fetch arbitrary third-party pages (CORS), so this callable
 * fetches the URL server-side, extracts OpenGraph/meta tags, and caches the
 * result in `linkPreviews/{sha256(normalizedUrl)}`. Clients call it on the
 * first URL in a chat message and render a preview card.
 *
 * SECURITY: this is the first outbound-fetching function in the chat path. It
 * MUST guard against SSRF — a user-supplied URL could otherwise be pointed at
 * internal services or cloud metadata endpoints. Defenses:
 *   - scheme allowlist (http/https only)
 *   - DNS-resolve every host (initial + each redirect hop) and reject
 *     loopback / private / link-local / CGNAT / metadata IP ranges (v4 + v6)
 *   - manual redirect following, capped at 3 hops, re-validated each hop
 *   - 5s timeout, 2MB body cap, text/html only
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as dns from "dns";
import * as net from "net";
import { Agent } from "undici";

const db = admin.firestore();

const CORS_ORIGINS = [
  "https://www.nextbench.in",
  "https://nextbench.in",
  "https://nextbench-a11ed.web.app",
  "https://nextbench-a11ed.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
];

const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const NEG_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── SSRF guards ──────────────────────────────────────────

/** Normalize + validate a URL: http(s) only, strip credentials & fragment. */
function normalizeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new HttpsError("invalid-argument", "Invalid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new HttpsError("invalid-argument", "Only http(s) URLs are supported.");
  }
  u.username = "";
  u.password = "";
  u.hash = "";
  return u;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const b = Number(p);
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
    n = (n << 8) | b;
  }
  return n >>> 0;
}

/** True if an IPv4 address is in a private/loopback/link-local/CGNAT/metadata range. */
function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → block
  const inRange = (base: string, bits: number) => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||        // "this" network
    inRange("10.0.0.0", 8) ||       // private
    inRange("100.64.0.0", 10) ||    // CGNAT
    inRange("127.0.0.0", 8) ||      // loopback
    inRange("169.254.0.0", 16) ||   // link-local (incl. 169.254.169.254 metadata)
    inRange("172.16.0.0", 12) ||    // private
    inRange("192.0.0.0", 24) ||     // IETF protocol assignments
    inRange("192.168.0.0", 16) ||   // private
    inRange("198.18.0.0", 15) ||    // benchmarking
    inRange("224.0.0.0", 4) ||      // multicast
    inRange("240.0.0.0", 4)         // reserved
  );
}

/**
 * Expand ANY IPv6 textual form to its 16 bytes. Handles `::` compression,
 * zone ids, and embedded IPv4 in BOTH dotted (`::ffff:1.2.3.4`) and hex
 * (`::ffff:0102:0304`) forms. Returns null if unparseable.
 */
function ipv6ToBytes(input: string): number[] | null {
  let addr = input.toLowerCase().split("%")[0]; // drop zone id
  // Split off a trailing embedded IPv4 (dotted) and convert to two hextets.
  const dotted = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ipv4ToInt(dotted[1]);
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    addr = addr.slice(0, dotted.index) + hi + ":" + lo;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const toHextets = (s: string) => (s === "" ? [] : s.split(":"));
  const head = toHextets(halves[0]);
  const tail = halves.length === 2 ? toHextets(halves[1]) : [];
  const missing = 8 - (head.length + tail.length);
  if (halves.length === 2) {
    if (missing < 0) return null;
  } else if (head.length !== 8) {
    return null;
  }
  const hextets = halves.length === 2
    ? [...head, ...Array(missing).fill("0"), ...tail]
    : head;
  if (hextets.length !== 8) return null;
  const bytes: number[] = [];
  for (const h of hextets) {
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
    const n = parseInt(h, 16);
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

/** True if an IPv6 address is loopback/link-local/unique-local/mapped-internal. */
function isBlockedIpv6(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  if (b === null) return true; // unparseable → block
  // IPv4-mapped ::ffff:0:0/96 — check the embedded v4 regardless of encoding.
  const isMapped = b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
  if (isMapped) {
    const v4 = `${b[12]}.${b[13]}.${b[14]}.${b[15]}`;
    return isBlockedIpv4(v4);
  }
  // IPv4-compatible / all-zero high bits (::x) incl. ::1 loopback and ::.
  const allZeroHigh = b.slice(0, 12).every((x) => x === 0);
  if (allZeroHigh) return true;
  const first = b[0];
  if ((first & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (first === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  return false;
}

/** Unified block check for any IP string (v4 or v6). */
function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // not a valid IP → block
}


/** Resolve a hostname and reject if ANY resolved address is internal. */
async function assertPublicHost(hostname: string): Promise<void> {
  // Direct IP literal? (strip IPv6 brackets)
  const stripped = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(stripped)) {
    if (isBlockedIp(stripped)) throw new HttpsError("invalid-argument", "URL host not allowed.");
    return;
  }
  let addrs: dns.LookupAddress[];
  try {
    addrs = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new HttpsError("invalid-argument", "Could not resolve URL host.");
  }
  if (addrs.length === 0) throw new HttpsError("invalid-argument", "Could not resolve URL host.");
  for (const a of addrs) {
    if (isBlockedIp(a.address)) throw new HttpsError("invalid-argument", "URL host not allowed.");
  }
}

// A custom undici Agent whose DNS lookup re-validates the resolved address at
// CONNECT time, closing the DNS-rebinding gap between assertPublicHost's lookup
// and the actual socket connection (the checked IP is the connected IP).
const ssrfSafeAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, all: false }, (err, address, family) => {
        if (err) return callback(err, address as any, family as any);
        if (isBlockedIp(String(address))) {
          return callback(new Error("Blocked internal address"), address as any, family as any);
        }
        callback(null, address as any, family as any);
      });
    },
  },
});

// ── Fetch + parse ────────────────────────────────────────

/** Fetch HTML with manual redirect following, each hop re-validated for SSRF. */
async function fetchHtml(startUrl: URL): Promise<{ html: string; finalUrl: URL }> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        // Pin the connect-time DNS lookup through the SSRF-safe agent so the
        // validated IP is the one actually connected (defeats DNS rebinding).
        dispatcher: ssrfSafeAgent,
        headers: {
          // A realistic UA; many sites gate OG tags behind one.
          "user-agent": "Mozilla/5.0 (compatible; NextbenchLinkPreview/1.0; +https://nextbench.in)",
          accept: "text/html,application/xhtml+xml",
        },
      } as any);
    } catch {
      throw new HttpsError("unavailable", "Failed to fetch URL.");
    } finally {
      clearTimeout(timer);
    }

    // Redirect?
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new HttpsError("unavailable", "Redirect without location.");
      if (hop === MAX_REDIRECTS) throw new HttpsError("unavailable", "Too many redirects.");
      current = normalizeUrl(new URL(loc, current).toString());
      continue;
    }

    if (!res.ok) throw new HttpsError("unavailable", `Fetch failed (${res.status}).`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) throw new HttpsError("invalid-argument", "URL is not an HTML page.");

    // Read at most MAX_BODY_BYTES.
    const reader = res.body?.getReader();
    if (!reader) throw new HttpsError("unavailable", "Empty response body.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= MAX_BODY_BYTES) {
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { html: buf.toString("utf8"), finalUrl: current };
  }
  throw new HttpsError("unavailable", "Too many redirects.");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1].trim());
  }
  return undefined;
}

interface Preview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

function parseOg(html: string, finalUrl: URL): Preview {
  const head = html.slice(0, 200_000); // OG tags live in <head>; cap work
  const title =
    metaContent(head, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i,
    ]) || metaContent(head, [/<title[^>]*>([^<]*)<\/title>/i]);
  const description = metaContent(head, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']*)["']/i,
  ]);
  const siteName = metaContent(head, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:site_name["']/i,
  ]);
  let image = metaContent(head, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*)["']/i,
  ]);
  if (image) {
    try {
      const abs = new URL(image, finalUrl);
      image = abs.protocol === "http:" || abs.protocol === "https:" ? abs.toString() : undefined;
    } catch {
      image = undefined;
    }
  }
  // Cap field lengths.
  const cap = (s: string | undefined, n: number) => (s && s.length > n ? s.slice(0, n) : s);
  return {
    title: cap(title, 200),
    description: cap(description, 500),
    siteName: cap(siteName, 200),
    image: image && image.length <= 2000 ? image : undefined,
  };
}

// ── Callable ─────────────────────────────────────────────

async function enforceRateLimit(uid: string, actionType: string, limit: number, windowMs: number): Promise<boolean> {
  const ref = db.collection("rate_limits").doc(`${actionType}_${uid}`);
  const now = Date.now();
  const windowStartThreshold = now - windowMs;
  try {
    let allowed = true;
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) {
        tx.set(ref, { count: 1, windowStart: now });
      } else {
        const data = doc.data();
        if (!data || data.windowStart < windowStartThreshold) {
          tx.update(ref, { count: 1, windowStart: now });
        } else if (data.count >= limit) {
          allowed = false;
        } else {
          tx.update(ref, { count: data.count + 1 });
        }
      }
    });
    return allowed;
  } catch {
    return true; // fail-open on rate-limit infra error (matches index.ts behavior)
  }
}

export const getLinkPreview = onCall(
  { invoker: "public", cors: CORS_ORIGINS },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

    const rawUrl = (request.data as { url?: unknown })?.url;
    if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 2000) {
      throw new HttpsError("invalid-argument", "A url string is required.");
    }

    const allowed = await enforceRateLimit(uid, "link_preview", 30, 60_000);
    if (!allowed) throw new HttpsError("resource-exhausted", "Too many preview requests. Try again shortly.");

    const normalized = normalizeUrl(rawUrl);
    const hash = crypto.createHash("sha256").update(normalized.toString()).digest("hex");
    const cacheRef = db.collection("linkPreviews").doc(hash);

    // Cache check.
    const snap = await cacheRef.get();
    if (snap.exists) {
      const d = snap.data() as any;
      const fetchedMs = d?.fetchedAt?.toMillis ? d.fetchedAt.toMillis() : 0;
      const age = Date.now() - fetchedMs;
      if (d?.status === "ok" && age < CACHE_TTL_MS) {
        return { url: normalized.toString(), title: d.title, description: d.description, image: d.image, siteName: d.siteName, cached: true };
      }
      if (d?.status === "failed" && age < NEG_CACHE_TTL_MS) {
        return { url: normalized.toString(), error: "no-preview", cached: true };
      }
    }

    // Fetch + parse.
    try {
      const { html, finalUrl } = await fetchHtml(normalized);
      const preview = parseOg(html, finalUrl);
      await cacheRef.set({
        url: normalized.toString(),
        title: preview.title ?? null,
        description: preview.description ?? null,
        image: preview.image ?? null,
        siteName: preview.siteName ?? null,
        status: "ok",
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { url: normalized.toString(), ...preview, cached: false };
    } catch (err) {
      // Negative-cache and return a soft error (never leak internal detail).
      await cacheRef.set({
        url: normalized.toString(),
        status: "failed",
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { url: normalized.toString(), error: "no-preview", cached: false };
    }
  }
);
