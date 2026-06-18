/**
 * Repost System
 *
 * Allows users to repost (share to their profile/feed) any post.
 * Tracks repost count on the original post and notifies the reposter's followers.
 *
 * Collection: `reposts`
 * Doc shape: { reposterId, reposterName, reposterProfilePicture, originalPostId, createdAt }
 */

import { useState, useEffect } from 'react';
import {
  collection, query, where, getDocs, addDoc, deleteDoc, doc, getDoc,
  updateDoc, increment, serverTimestamp, onSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { createNotification } from './notifications';

/**
 * Repost a post. Creates a repost doc, increments repostsCount, and
 * notifies the reposter's followers.
 */
export async function repostPost(
  userId: string,
  userName: string,
  userProfilePicture: string | null | undefined,
  post: { id: string; title: string; authorId: string }
): Promise<void> {
  // Prevent duplicate reposts
  const existingQ = query(
    collection(db, 'reposts'),
    where('reposterId', '==', userId),
    where('originalPostId', '==', post.id)
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) return; // Already reposted

  // Create repost doc
  await addDoc(collection(db, 'reposts'), {
    reposterId: userId,
    reposterName: userName,
    reposterProfilePicture: userProfilePicture || null,
    originalPostId: post.id,
    createdAt: serverTimestamp(),
  });

  // Increment repost count on the original post
  try {
    await updateDoc(doc(db, 'posts', post.id), {
      repostsCount: increment(1),
    });
  } catch {
    // Post may not exist or field may not exist yet — non-critical
  }

  // Notify the original author (if not self)
  if (post.authorId !== userId) {
    try {
      await createNotification({
        userId: post.authorId,
        type: 'repost',
        title: 'Your post was reposted',
        message: `${userName} reposted "${post.title || 'your post'}"`,
        link: `/dashboard?postId=${post.id}`,
        postId: post.id,
      });
    } catch {
      // Non-critical
    }
  }

  // Fan out notifications to the reposter's followers
  try {
    const followersQ = query(
      collection(db, 'follows'),
      where('followingId', '==', userId)
    );
    const followersSnap = await getDocs(followersQ);
    const followerIds: string[] = [];
    followersSnap.forEach((d) => {
      const followerId = d.data().followerId;
      if (followerId !== userId && followerId !== post.authorId) {
        followerIds.push(followerId);
      }
    });

    // Batch notifications in groups to avoid overwhelming Firestore
    const BATCH_SIZE = 50;
    for (let i = 0; i < followerIds.length; i += BATCH_SIZE) {
      const batch = followerIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((followerId) =>
          createNotification({
            userId: followerId,
            type: 'repost',
            title: 'Repost',
            message: `${userName} reposted: "${post.title || 'a post'}"`,
            link: `/dashboard?postId=${post.id}`,
            postId: post.id,
          })
        )
      );
    }
  } catch (err) {
    console.warn('Failed to send repost follower notifications:', err);
  }
}

/**
 * Undo a repost. Deletes the repost doc and decrements repostsCount.
 */
export async function undoRepost(userId: string, postId: string): Promise<void> {
  const q = query(
    collection(db, 'reposts'),
    where('reposterId', '==', userId),
    where('originalPostId', '==', postId)
  );
  const snap = await getDocs(q);

  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));

  if (!snap.empty) {
    try {
      await updateDoc(doc(db, 'posts', postId), {
        repostsCount: increment(-1),
      });
    } catch {
      // Non-critical
    }
  }
}

/**
 * Hook: track which posts the current user has reposted.
 * Returns a Set of original post IDs.
 */
export function useRepostedPostIds() {
  const { user } = useAuth();
  const [repostedIds, setRepostedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setRepostedIds(new Set());
      return;
    }

    const q = query(collection(db, 'reposts'), where('reposterId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set<string>();
      snap.forEach((d) => ids.add(d.data().originalPostId));
      setRepostedIds(ids);
    }, (err) => {
      console.warn('reposts: listener error (ignored):', err);
      setRepostedIds(new Set());
    });

    return () => unsub();
  }, [user?.uid]);

  return repostedIds;
}
