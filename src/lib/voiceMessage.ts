/**
 * Voice Message Service
 *
 * Handles uploading voice recordings to Firebase Storage and
 * creating the corresponding Firestore message documents.
 * Includes auto-retry on upload failure and orphan cleanup.
 */

import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db, storage } from './firebase';
import { createNotification } from './notifications';

export interface VoiceUploadResult {
  downloadUrl: string;
  storagePath: string;
}

export type UploadProgressCallback = (progress: number) => void;

/**
 * Upload a voice recording blob to Firebase Storage.
 * Uses uploadBytesResumable() with progress tracking.
 * Retries once on failure.
 */
export async function uploadVoiceMessage(
  blob: Blob,
  chatId: string,
  onProgress?: UploadProgressCallback
): Promise<VoiceUploadResult> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized. Check your VITE_FIREBASE_STORAGE_BUCKET env variable.');
  }

  const timestamp = Date.now();
  const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
  const storagePath = `voice/${chatId}/${timestamp}.${ext}`;
  const storageRef = ref(storage, storagePath);

  const attemptUpload = (): Promise<VoiceUploadResult> => {
    return new Promise<VoiceUploadResult>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, blob, {
        contentType: blob.type || 'audio/webm',
      });

      task.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes > 0) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(pct);
          }
        },
        (error) => reject(error),
        async () => {
          try {
            const downloadUrl = await getDownloadURL(task.snapshot.ref);
            resolve({ downloadUrl, storagePath });
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  };

  // First attempt
  try {
    return await attemptUpload();
  } catch (firstError) {
    console.warn('[VoiceMessage] Upload failed, retrying once...', firstError);
    // Second attempt (auto-retry)
    try {
      return await attemptUpload();
    } catch (retryError) {
      throw new Error('Failed to upload voice message. Please check your connection and try again.');
    }
  }
}

export interface SendVoiceMessageParams {
  senderId: string;
  senderName: string;
  chatId: string;
  audioUrl: string;
  duration: number;
  fileSize: number;
  mimeType: string;
  storagePath: string;
}

/**
 * Save a voice message to Firestore and update the chat room metadata.
 * If the Firestore write fails, the uploaded audio file is deleted
 * from Storage to prevent orphaned files.
 */
export async function sendVoiceMessage(params: SendVoiceMessageParams): Promise<void> {
  const {
    senderId, senderName, chatId, audioUrl,
    duration, fileSize, mimeType, storagePath,
  } = params;

  const messageData = {
    senderId,
    type: 'voice' as const,
    audioUrl,
    duration,
    fileSize,
    mimeType,
    createdAt: serverTimestamp(),
    delivered: false,
    seen: false,
  };

  try {
    // Write the message document
    await addDoc(collection(db, 'chatRooms', chatId, 'messages'), messageData);

    // Get room data for recipient ID
    const roomSnap = await getDoc(doc(db, 'chatRooms', chatId));
    const roomData = roomSnap.data();
    const recipientId = roomData?.participants?.find((id: string) => id !== senderId);

    // Update room metadata
    const updateData: Record<string, any> = {
      lastMessage: '🎤 Voice message',
      lastMessageType: 'voice',
      lastSenderId: senderId,
      updatedAt: serverTimestamp(),
    };

    if (recipientId) {
      updateData.unreadBy = arrayUnion(recipientId);
    }

    await updateDoc(doc(db, 'chatRooms', chatId), updateData);

    // Send notification to recipient
    if (recipientId) {
      createNotification({
        userId: recipientId,
        type: 'new_message',
        title: 'New Message',
        message: `${senderName || 'Someone'} sent you a voice message`,
        link: `/chat/${chatId}`,
      }).catch(err => console.warn('Failed to send voice message notification:', err));
    }
  } catch (err) {
    // Firestore write failed — clean up the uploaded audio file
    console.error('[VoiceMessage] Firestore write failed, cleaning up storage:', err);
    await deleteStorageFile(storagePath);
    throw new Error('Failed to send voice message. Please try again.');
  }
}

/**
 * Delete an uploaded file from Firebase Storage.
 * Used for orphan cleanup when Firestore writes fail.
 */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  if (!storage) return;

  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
  } catch (err) {
    // Log but don't throw — this is a cleanup attempt
    console.warn('[VoiceMessage] Failed to delete orphaned file:', storagePath, err);
  }
}
