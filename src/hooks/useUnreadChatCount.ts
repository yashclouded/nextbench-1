import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useUnreadChatCount(userId?: string | null) {
  const [dmCount, setDmCount] = useState(0);
  const [clubCount, setClubCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setDmCount(0);
      setClubCount(0);
      return;
    }

    const qDMs = query(
      collection(db, 'chatRooms'),
      where('participants', 'array-contains', userId)
    );

    const unsubDMs = onSnapshot(qDMs, (snapshot) => {
      let unread = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Muted or archived conversations don't contribute to the badge.
        if (data.mutedBy?.includes(userId) || data.archivedBy?.includes(userId)) return;
        const unreadBy = data.unreadBy;
        if (Array.isArray(unreadBy) && unreadBy.includes(userId)) {
          unread++;
        }
      });
      setDmCount(unread);
    }, (err) => {
      console.error('Failed to subscribe to unread DMs:', err);
    });

    const qClubs = query(
      collection(db, 'clubs'),
      where('memberIds', 'array-contains', userId)
    );

    const unsubClubs = onSnapshot(qClubs, (snapshot) => {
      let unread = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Muted or archived clubs don't contribute to the badge.
        if (data.mutedBy?.includes(userId) || data.archivedBy?.includes(userId)) return;
        const unreadBy = data.unreadBy;
        if (Array.isArray(unreadBy) && unreadBy.includes(userId)) {
          unread++;
        }
      });
      setClubCount(unread);
    }, (err) => {
      console.error('Failed to subscribe to unread clubs:', err);
    });

    return () => {
      unsubDMs();
      unsubClubs();
    };
  }, [userId]);

  return dmCount + clubCount;
}
