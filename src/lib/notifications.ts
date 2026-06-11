import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationType = 'user_approved' | 'listing_approved' | 'listing_rejected' | 'new_message' | 'new_post' | 'item_reserved' | 'item_sold' | 'new_review' | 'admin_promoted';

export function isChatMessageNotification(data: { type?: unknown; link?: unknown }) {
  return data.type === 'new_message' && typeof data.link === 'string' && data.link.startsWith('/chat/');
}

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  postId?: string;
}

/**
 * Creates a notification document in Firestore.
 * Called after key actions like approvals, messages, etc.
 */
export async function createNotification({ userId, type, title, message, link, postId }: CreateNotificationParams) {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      type,
      title,
      message,
      link: link || null,
      postId: postId || null,
      read: false,
      createdAt: serverTimestamp(),
    });

    // Fetch user document to get FCM tokens
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const fcmTokens = userDoc.data()?.fcmTokens || [];
      if (fcmTokens.length > 0) {
        // Trigger push notification via Vercel serverless function
        fetch('/api/send-notification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokens: fcmTokens,
            title,
            body: message,
            link: link || '/'
          })
        }).catch(err => {
          console.warn('Failed to trigger push notification API:', err);
        });
      }
    }
  } catch (err) {
    // Silently fail — notifications are non-critical
    console.warn('Failed to create notification:', err);
  }
}
