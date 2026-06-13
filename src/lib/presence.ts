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

import { collection, doc, query, updateDoc, serverTimestamp, onSnapshot, where } from 'firebase/firestore';
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

export function usePresence(uid: string | null | undefined) {
  useEffect(() => {
    if (!uid) return;

    setOnline(uid);

    const heartbeat = setInterval(() => setOnline(uid), HEARTBEAT_INTERVAL_MS);

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
  label: string;
  lastSeen: Date | null;
}

function computePresence(data: any): UserPresence {
  const lastSeenDate: Date | null = data?.lastSeen?.toDate?.() ?? null;
  const isOnlineFlag: boolean = data?.online === true;
  const now = Date.now();
  const msSince = lastSeenDate ? now - lastSeenDate.getTime() : Infinity;

  if (isOnlineFlag && msSince < ONLINE_THRESHOLD_MS) {
    return { status: 'online', label: 'Online', lastSeen: lastSeenDate };
  }

  if (isOnlineFlag && !lastSeenDate) {
    return { status: 'online', label: 'Online', lastSeen: null };
  }

  if (msSince < RECENT_THRESHOLD_MS) {
    const mins = Math.floor(msSince / 60_000);
    const label = mins < 1 ? 'Active just now' : `Active ${mins}m ago`;
    return { status: 'recent', label, lastSeen: lastSeenDate };
  }

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

export function getPresenceFromData(userData: any): UserPresence {
  return computePresence(userData);
}

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

// ─── useOnlineCount — count users online right now ───────────────────────────

/**
 * Subscribes to all users with online === true and counts how many
 * have a lastSeen within ONLINE_THRESHOLD_MS (90s).
 * Excludes the current user from the count so you don't count yourself.
 */
export function useOnlineCount(currentUid?: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('online', '==', true)
    );

    const unsub = onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
      const now = Date.now();
      let total = 0;
      snap.forEach(docSnap => {
        if (docSnap.id === currentUid) return;
        const data = docSnap.data();
        const lastSeen: Date | null = data?.lastSeen?.toDate?.() ?? null;
        const msSince = lastSeen ? now - lastSeen.getTime() : Infinity;
        if (msSince < ONLINE_THRESHOLD_MS) total++;
      });
      setCount(total);
    }, (err) => {
      console.warn('presence: online count listener error (ignored):', err);
    });

    return unsub;
  }, [currentUid]);

  return count;
}