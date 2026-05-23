import { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, getDocs, serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { getDoc, doc } from 'firebase/firestore';

// ─── Follow / Unfollow ───────────────────────────────────

export async function followUser(currentUserId: string, targetUserId: string) {
  if (currentUserId === targetUserId) return;

  // Check if already following
  const q = query(
    collection(db, 'follows'),
    where('followerId', '==', currentUserId),
    where('followingId', '==', targetUserId)
  );
  const snap = await getDocs(q);
  if (!snap.empty) return; // Already following

  await addDoc(collection(db, 'follows'), {
    followerId: currentUserId,
    followingId: targetUserId,
    createdAt: serverTimestamp(),
  });

  try {
    const uDoc = await getDoc(doc(db, 'users', currentUserId));
    const currentUserName = uDoc.data()?.name || 'Someone';
    await addDoc(collection(db, 'notifications'), {
      userId: targetUserId,
      type: 'user_approved', // Reusing an existing icon mapped to ShieldCheck/User
      title: 'New Follower',
      message: `${currentUserName} started following you.`,
      read: false,
      link: `/profile/${currentUserId}`,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('Failed to send follow notification', e);
  }
}

export async function unfollowUser(currentUserId: string, targetUserId: string) {
  const q = query(
    collection(db, 'follows'),
    where('followerId', '==', currentUserId),
    where('followingId', '==', targetUserId)
  );
  const snap = await getDocs(q);
  snap.forEach(async (d) => {
    await deleteDoc(d.ref);
  });
}

// ─── Hook: Follow Status ─────────────────────────────────

export function useFollowStatus(targetUserId: string | undefined) {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);

  useEffect(() => {
    if (!user || !targetUserId || user.uid === targetUserId) {
      setIsFollowing(false);
      setIsFollowedBy(false);
      return;
    }

    // Am I following them?
    const q1 = query(
      collection(db, 'follows'),
      where('followerId', '==', user.uid),
      where('followingId', '==', targetUserId)
    );
    const unsub1 = onSnapshot(q1, (snap) => {
      setIsFollowing(!snap.empty);
    }, (err) => {
      console.warn('follows: follow status listener error (ignored):', err.code);
      setIsFollowing(false);
    });

    // Are they following me?
    const q2 = query(
      collection(db, 'follows'),
      where('followerId', '==', targetUserId),
      where('followingId', '==', user.uid)
    );
    const unsub2 = onSnapshot(q2, (snap) => {
      setIsFollowedBy(!snap.empty);
    }, (err) => {
      console.warn('follows: followed-by listener error (ignored):', err.code);
      setIsFollowedBy(false);
    });

    return () => { unsub1(); unsub2(); };
  }, [user, targetUserId]);

  const isFriend = isFollowing && isFollowedBy;

  return { isFollowing, isFollowedBy, isFriend };
}

// ─── Hook: Follow Counts ─────────────────────────────────

export function useFollowCounts(userId: string | undefined) {
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (!userId || !user) return;

    // Followers = people who follow this user
    const q1 = query(collection(db, 'follows'), where('followingId', '==', userId));
    const unsub1 = onSnapshot(q1, (snap) => setFollowersCount(snap.size), (err) => {
      console.warn('follows: followers count listener error (ignored):', err.code);
      setFollowersCount(0);
    });

    // Following = people this user follows
    const q2 = query(collection(db, 'follows'), where('followerId', '==', userId));
    const unsub2 = onSnapshot(q2, (snap) => setFollowingCount(snap.size), (err) => {
      console.warn('follows: following count listener error (ignored):', err.code);
      setFollowingCount(0);
    });

    return () => { unsub1(); unsub2(); };
  }, [userId, user]);

  return { followersCount, followingCount };
}

// ─── Hook: Following IDs Set (for feed algorithm) ────────

export function useFollowingIds() {
  const { user } = useAuth();
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followerIdsSet, setFollowerIdsSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setFollowingIds(new Set());
      setFollowerIdsSet(new Set());
      return;
    }

    // Who I follow
    const q1 = query(collection(db, 'follows'), where('followerId', '==', user.uid));
    const unsub1 = onSnapshot(q1, (snap) => {
      const ids = new Set<string>();
      snap.forEach(d => ids.add(d.data().followingId));
      setFollowingIds(ids);
    }, (err) => {
      console.warn('follows: following IDs listener error (ignored):', err.code);
      setFollowingIds(new Set());
    });

    // Who follows me
    const q2 = query(collection(db, 'follows'), where('followingId', '==', user.uid));
    const unsub2 = onSnapshot(q2, (snap) => {
      const ids = new Set<string>();
      snap.forEach(d => ids.add(d.data().followerId));
      setFollowerIdsSet(ids);
    }, (err) => {
      console.warn('follows: follower IDs listener error (ignored):', err.code);
      setFollowerIdsSet(new Set());
    });

    return () => { unsub1(); unsub2(); };
  }, [user]);

  // CRITICAL: Memoize friendIds so it's a stable reference.
  // Without this, friendIds is a new Set on every render, causing any
  // useEffect with it in its dependency array to re-fire endlessly.
  const friendIds = useMemo(() => {
    const friends = new Set<string>();
    followingIds.forEach(id => {
      if (followerIdsSet.has(id)) friends.add(id);
    });
    return friends;
  }, [followingIds, followerIdsSet]);

  return { followingIds, friendIds };
}

// ─── Hook: Followers/Following Lists ─────────────────────

export function useFollowersList(userId: string | undefined) {
  const [followerIds, setFollowerIds] = useState<string[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!userId || !user) return;
    const q = query(collection(db, 'follows'), where('followingId', '==', userId));
    const unsub = onSnapshot(q, (snap) => {
      const ids: string[] = [];
      snap.forEach(d => ids.push(d.data().followerId));
      setFollowerIds(ids);
    }, (err) => {
      console.warn('follows: followers list listener error (ignored):', err.code);
      setFollowerIds([]);
    });
    return () => unsub();
  }, [userId, user]);

  return followerIds;
}

export function useFollowingList(userId: string | undefined) {
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!userId || !user) return;
    const q = query(collection(db, 'follows'), where('followerId', '==', userId));
    const unsub = onSnapshot(q, (snap) => {
      const ids: string[] = [];
      snap.forEach(d => ids.push(d.data().followingId));
      setFollowingIds(ids);
    }, (err) => {
      console.warn('follows: following list listener error (ignored):', err.code);
      setFollowingIds([]);
    });
    return () => unsub();
  }, [userId, user]);

  return followingIds;
}
