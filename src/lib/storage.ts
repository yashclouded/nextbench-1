import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads an image file to Firebase Storage and returns the download URL.
 */
export async function uploadProductImage(file: File, userId: string): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `products/${userId}/${timestamp}_${safeName}`;
  const storageRef = ref(storage, path);

  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      uploadedBy: userId,
    },
  });

  return getDownloadURL(snapshot.ref);
}

/**
 * Uploads a profile picture to Firebase Storage and returns the download URL.
 */
export async function uploadProfilePicture(file: File, userId: string): Promise<string> {
  const path = `profiles/${userId}/avatar_${Date.now()}`;
  const storageRef = ref(storage, path);

  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
  });

  return getDownloadURL(snapshot.ref);
}
