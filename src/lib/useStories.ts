/**
 * React hooks for the Stories row/viewer. Thin layer over the pure `stories.ts` API +
 * existing auth/follow hooks. Keeps `stories.ts` free of React.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useFollowingIds } from './follows';
import { getStoriesTray, type TrayEntry } from './stories';

export interface UseStoriesTray {
  tray: TrayEntry[];
  loading: boolean;
  refetch: () => void;
  /** Optimistically grey an author's ring after their stories are viewed (no refetch). */
  markSeenLocal: (authorId: string) => void;
}

/**
 * Session cache of the last-fetched tray per user, so remounting the feed shows the row
 * instantly (no spinner) while a fresh copy loads quietly in the background.
 */
const trayCache = new Map<string, TrayEntry[]>();

export function useStoriesTray(): UseStoriesTray {
  const { user } = useAuth();
  const { followingIds } = useFollowingIds();

  const initial = user ? trayCache.get(user.uid) : undefined;
  const [tray, setTray] = useState<TrayEntry[]>(initial ?? []);
  const [loading, setLoading] = useState(!initial);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!user) {
      setTray([]);
      setLoading(false);
      return;
    }
    const myReq = ++reqId.current;
    if (!trayCache.has(user.uid)) setLoading(true); // spinner only when nothing cached
    try {
      const result = await getStoriesTray(user.uid, Array.from(followingIds));
      if (reqId.current === myReq) {
        setTray(result);
        trayCache.set(user.uid, result);
      }
    } catch (err) {
      console.warn('useStoriesTray: failed to load tray (ignored):', err);
      if (reqId.current === myReq && !trayCache.has(user.uid)) setTray([]);
    } finally {
      if (reqId.current === myReq) setLoading(false);
    }
  }, [user?.uid, followingIds]);

  useEffect(() => {
    // Seed instantly from cache (no flash), then refresh in the background.
    if (user) {
      const cached = trayCache.get(user.uid);
      if (cached) {
        setTray(cached);
        setLoading(false);
      }
    }
    load();
  }, [load]);

  const markSeenLocal = useCallback(
    (authorId: string) => {
      setTray((prev) => {
        let changed = false;
        const next = prev.map((e) => {
          if (e.authorId === authorId && e.hasUnseen) {
            changed = true;
            return { ...e, hasUnseen: false };
          }
          return e;
        });
        if (changed && user) trayCache.set(user.uid, next);
        return changed ? next : prev;
      });
    },
    [user?.uid],
  );

  return { tray, loading, refetch: load, markSeenLocal };
}
