/**
 * Block System
 *
 * Collection: `blocks`
 * Doc shape: { blockerId, blockedId, createdAt }
 * Doc ID: `${blockerId}_${blockedId}` for easy lookup
 */

import { useState, useEffect } from 'react';
import {
  doc, setDoc, deleteDoc, serverTimestamp,
  collection, query, where, onSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';

/**
 * Block a user
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const docId = `${blockerId}_${blockedId}`;
  await setDoc(doc(db, 'blocks', docId), {
    blockerId,
    blockedId,
    createdAt: serverTimestamp(),
  });
}

/**
 * Unblock a user
 */
export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const docId = `${blockerId}_${blockedId}`;
  await deleteDoc(doc(db, 'blocks', docId));
}

/**
 * Hook: returns the set of user IDs blocked by the current user
 */
export function useBlockedIds(): Set<string> {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setBlockedIds(new Set());
      return;
    }

    const q = query(
      collection(db, 'blocks'),
      where('blockerId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set<string>();
      snap.forEach((d) => ids.add(d.data().blockedId));
      setBlockedIds(ids);
    }, (err) => {
      console.warn('blocks: blocked IDs listener error (ignored):', err);
    });

    return () => unsub();
  }, [user?.uid]);

  return blockedIds;
}

/**
 * Hook: returns the set of user IDs who have blocked the current user
 */
export function useBlockedByIds(): Set<string> {
  const { user } = useAuth();
  const [blockedByIds, setBlockedByIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setBlockedByIds(new Set());
      return;
    }

    const q = query(
      collection(db, 'blocks'),
      where('blockedId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set<string>();
      snap.forEach((d) => ids.add(d.data().blockerId));
      setBlockedByIds(ids);
    }, (err) => {
      console.warn('blocks: blockedBy IDs listener error (ignored):', err);
    });

    return () => unsub();
  }, [user?.uid]);

  return blockedByIds;
}

/**
 * Hook: block status between current user and a target user
 */
export function useBlockStatus(targetUserId?: string): {
  isBlocked: boolean;   // current user blocked target
  isBlockedBy: boolean; // target blocked current user
} {
  const { user } = useAuth();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockedBy, setIsBlockedBy] = useState(false);

  useEffect(() => {
    if (!user || !targetUserId || user.uid === targetUserId) {
      setIsBlocked(false);
      setIsBlockedBy(false);
      return;
    }

    // Check if current user blocked target
    const docId1 = `${user.uid}_${targetUserId}`;
    const unsub1 = onSnapshot(doc(db, 'blocks', docId1), (snap) => {
      setIsBlocked(snap.exists());
    }, (err) => {
      console.warn('blocks: isBlocked listener error (ignored):', err);
      setIsBlocked(false);
    });

    // Check if target blocked current user
    const docId2 = `${targetUserId}_${user.uid}`;
    const unsub2 = onSnapshot(doc(db, 'blocks', docId2), (snap) => {
      setIsBlockedBy(snap.exists());
    }, (err) => {
      console.warn('blocks: isBlockedBy listener error (ignored):', err);
      setIsBlockedBy(false);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [user?.uid, targetUserId]);

  return { isBlocked, isBlockedBy };
}
