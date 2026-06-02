import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useUnreadChatCount(userId?: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const q = query(
      collection(db, 'chatRooms'),
      where('participants', 'array-contains', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let unreadRooms = 0;

      snapshot.forEach((roomDoc) => {
        const unreadBy = roomDoc.data().unreadBy;
        if (Array.isArray(unreadBy) && unreadBy.includes(userId)) {
          unreadRooms++;
        }
      });

      setCount(unreadRooms);
    }, (err) => {
      console.error('Failed to subscribe to unread chats:', err);
      setCount(0);
    });

    return () => unsubscribe();
  }, [userId]);

  return count;
}
