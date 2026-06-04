/**
 * Direct Messaging Utilities
 * 
 * Supports DM rooms independent of products.
 * DM rooms have `type: 'dm'` and no `productId`.
 */

import {
  collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc, limit
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Find an existing DM room between two users, or create a new one.
 * Returns the room ID.
 */
export async function getOrCreateDMRoom(
  currentUserId: string,
  otherUserId: string
): Promise<string> {
  // Search for existing DM rooms where both users are participants
  // We query for rooms where the current user is a participant and type is 'dm'
  const q = query(
    collection(db, 'chatRooms'),
    where('participants', 'array-contains', currentUserId),
    where('type', '==', 'dm')
  );

  const snap = await getDocs(q);

  // Check if any of these rooms also contain the other user
  for (const d of snap.docs) {
    const data = d.data();
    if (data.participants.includes(otherUserId)) {
      return d.id;
    }
  }

  // Check if we need to create a pending room
  let isPending = false;
  
  const targetUserDoc = await getDoc(doc(db, 'users', otherUserId));
  if (targetUserDoc.exists()) {
    const targetData = targetUserDoc.data();
    if (targetData?.chatPrivacy?.followersOnly) {
      // Check if currentUser follows the target
      const followSnap = await getDocs(
        query(
          collection(db, 'follows'),
          where('followerId', '==', currentUserId),
          where('followingId', '==', otherUserId),
          limit(1)
        )
      );
      if (followSnap.empty) {
        isPending = true;
      }
    }
  }

  // No existing DM room — create one
  const newRoom = await addDoc(collection(db, 'chatRooms'), {
    participants: [currentUserId, otherUserId],
    type: 'dm',
    productId: '',
    productTitle: '',
    lastMessage: '',
    lastSenderId: '',
    status: isPending ? 'pending' : 'active',
    requestedBy: isPending ? currentUserId : null,
    updatedAt: serverTimestamp(),
  });

  return newRoom.id;
}
