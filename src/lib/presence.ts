/**
 * Presence System
 *
 * Uses a heartbeat written to users/{uid}.onlineStatus in Firestore.
 * We can't use Firebase Realtime DB's onDisconnect, so instead:
 *  - On mount: set online = true, lastSeen = now
 *  - Every 60s: refresh lastSeen (heartbeat)
 *  - On beforeunload / visibilitychange hidden: set online = false
 *
 * "Online" = online === true AND lastSeen < 90s ago (handles tab crashes).
 * "Recently active" = lastSeen < 5 min ago.
 */

import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';

const HEARTBEAT_INTERVAL_MS = 60_000; // 1 min
const ONLINE_THRESHOLD_MS   = 90_000; // 90s — covers one missed heartbeat
const RECENT_THRESHOLD_MS   = 5 * 60_000; // 5 min

// ─── Write helpers ────────────────────────────────────────────────────────────

async function setOnline(uid: string) {
  try {
    await updateDoc(doc(db, 'users', uid), {
      online: true,
      lastSeen: serverTimestamp(),
    });
  } catch {
    // Non-critical — ignore permission errors during sign-out race
  }
}

async function setOffline(uid: string) {
  try {
    await updateDoc(doc(db, 'users', uid), {
      online: false,
      lastSeen: serverTimestamp(),
    });
  } catch {
    // Non-critical
  }
}

// ─── usePresence — call once at the app root (inside AuthProvider) ────────────

/**
 * Call this hook with the current user's uid to start broadcasting presence.
 * Pass `null` when signed out.
 */
export function usePresence(uid: string | null | undefined) {
  useEffect(() => {
    if (!uid) return;

    setOnline(uid);

    // Heartbeat: keep lastSeen fresh so we don't appear offline after 90s
    const heartbeat = setInterval(() => setOnline(uid), HEARTBEAT_INTERVAL_MS);

    // Go offline when tab is hidden or closed
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setOffline(uid);
      } else {
        setOnline(uid);
      }
    };

    const handleUnload = () => setOffline(uid);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      setOffline(uid);
    };
  }, [uid]);
}

// ─── useUserPresence — subscribe to another user's status ────────────────────

export type PresenceStatus = 'online' | 'recent' | 'offline';

export interface UserPresence {
  status: PresenceStatus;
  /** Human-readable label: "Online", "Active Xm ago", "Last seen …" */
  label: string;
  lastSeen: Date | null;
}

function computePresence(data: any): UserPresence {
  const lastSeenDate: Date | null = data?.lastSeen?.toDate?.() ?? null;
  const isOnlineFlag: boolean = data?.online === true;
  const now = Date.now();
  const msSince = lastSeenDate ? now - lastSeenDate.getTime() : Infinity;

  // If online flag is set, show as online even if lastSeen hasn't been written yet
  if (isOnlineFlag && msSince < ONLINE_THRESHOLD_MS) {
    return { status: 'online', label: 'Online', lastSeen: lastSeenDate };
  }

  // Also online if flag set but no lastSeen yet (first write still in flight)
  if (isOnlineFlag && !lastSeenDate) {
    return { status: 'online', label: 'Online', lastSeen: null };
  }

  if (msSince < RECENT_THRESHOLD_MS) {
    const mins = Math.floor(msSince / 60_000);
    const label = mins < 1 ? 'Active just now' : `Active ${mins}m ago`;
    return { status: 'recent', label, lastSeen: lastSeenDate };
  }

  // Format last seen
  let label = 'Offline';
  if (lastSeenDate) {
    const diffDays = Math.floor(msSince / 86_400_000);
    if (diffDays === 0) {
      label = `Last seen ${lastSeenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      label = 'Last seen yesterday';
    } else if (diffDays < 7) {
      label = `Last seen ${diffDays}d ago`;
    } else {
      label = `Last seen ${lastSeenDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    }
  }

  return { status: 'offline', label, lastSeen: lastSeenDate };
}

/**
 * Subscribe to a user's presence in real time.
 * Pass `null` to skip (e.g. before the other user is known).
 */
export function useUserPresence(uid: string | null | undefined): UserPresence {
  const [presence, setPresence] = useState<UserPresence>({
    status: 'offline',
    label: '',
    lastSeen: null,
  });

  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) {
          // Skip stale cache reads that show offline — wait for server
          if (snap.metadata.fromCache && snap.data()?.online !== true) return;
          setPresence(computePresence(snap.data()));
        }
      }
    );

    return unsub;
  }, [uid]);

  return presence;
}
// ─── Batch presence for chat list ────────────────────────────────────────────

/**
 * Given a map of uid → Firestore user data, derive presence for each.
 * Useful for rendering green dots in ChatList without extra subscriptions.
 */
export function getPresenceFromData(userData: any): UserPresence {
  return computePresence(userData);
}
// Add to presence.ts
export function usePresenceMap(uids: string[]): Record<string, UserPresence> {
  const [map, setMap] = useState<Record<string, UserPresence>>({});
  const key = [...new Set(uids)].sort().join(',');

  useEffect(() => {
    if (!key) return;
    const dedupedUids = key.split(',');
    const unsubs = dedupedUids.map(uid =>
      onSnapshot(
        doc(db, 'users', uid),
        { includeMetadataChanges: true },
        snap => {
          if (snap.exists()) {
            if (snap.metadata.fromCache && snap.data()?.online !== true) return;
            setMap(prev => ({ ...prev, [uid]: computePresence(snap.data()) }));
          }
        }
      )
    );
    return () => unsubs.forEach(u => u());
  }, [key]);

  return map;
}