import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
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
}

/**
 * Creates a notification document in Firestore.
 * Called after key actions like approvals, messages, etc.
 */
export async function createNotification({ userId, type, title, message, link }: CreateNotificationParams) {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      type,
      title,
      message,
      link: link || null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Silently fail — notifications are non-critical
    console.warn('Failed to create notification:', err);
  }
}
