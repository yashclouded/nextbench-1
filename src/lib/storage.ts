/**
 * Cloudinary Storage Helper
 * We use Cloudinary instead of Firebase Storage to keep the app 100% free
 * and avoid requiring a credit card for the Firebase Blaze plan.
 */

import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export type UploadProgressCallback = (progress: number, loaded: number, total: number) => void;

/**
 * Generic upload function to Cloudinary via unauthenticated REST API.
 * Accepts an optional onProgress callback (0–100) using XHR for real progress events.
 */
export async function uploadToCloudinary(
  file: File,
  folder: string,
  onProgress?: UploadProgressCallback,
  resourceType: 'auto' | 'image' | 'video' | 'raw' = 'auto'
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary environment variables are missing.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct, e.loaded, e.total);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url);
        } catch {
          reject(new Error('Failed to parse Cloudinary response.'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error?.message || 'Failed to upload file.'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload was aborted.')));

    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`);
    xhr.send(formData);
  });
}

/**
 * Uploads an image file to Cloudinary and returns the download URL.
 */
export async function uploadProductImage(file: File, userId: string, onProgress?: UploadProgressCallback): Promise<string> {
  return uploadToCloudinary(file, `nextbench/products/${userId}`, onProgress);
}

/**
 * Uploads a profile picture to Cloudinary and returns the download URL.
 */
export async function uploadProfilePicture(file: File, userId: string, onProgress?: UploadProgressCallback): Promise<string> {
  return uploadToCloudinary(file, `nextbench/profiles/${userId}`, onProgress);
}

/**
 * Uploads an image to be sent in a chat message.
 */
export async function uploadChatImage(file: File, roomId: string): Promise<string> {
  return uploadToCloudinary(file, `nextbench/chats/${roomId}`);
}

/**
 * Uploads an ID card for a school addition request.
 */
export async function uploadSchoolIdCard(file: File): Promise<string> {
  const randomId = Math.random().toString(36).substring(2, 15);
  return uploadToCloudinary(file, `nextbench/school_requests/${randomId}`);
}

/**
 * Uploads an image for a community post.
 */
export async function uploadPostImage(file: File, onProgress?: UploadProgressCallback): Promise<string> {
  const randomId = Math.random().toString(36).substring(2, 15);
  return uploadToCloudinary(file, `nextbench/posts/${randomId}`, onProgress);
}

/**
 * Uploads a PDF for a community post via Cloudinary's image pipeline.
 * Returns { url, pages } so we can render each page as an image using
 * Cloudinary's pg_N transformation — no external PDF viewer needed.
 */
export async function uploadPostPdf(file: File, onProgress?: UploadProgressCallback): Promise<{ url: string; pages: number }> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary environment variables are missing.');
  }

  const randomId = Math.random().toString(36).substring(2, 15);

  return new Promise<{ url: string; pages: number }>((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', `nextbench/posts/pdf_${randomId}`);

    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.secure_url, pages: data.pages || 1 });
        } catch {
          reject(new Error('Failed to parse Cloudinary response.'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error?.message || 'Failed to upload PDF.'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted.')));

    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.send(formData);
  });
}

/**
 * Uploads a verification document for an organization (GSTIN, UDISE, registration cert).
 */
export async function uploadOrgDocument(file: File): Promise<string> {
  const randomId = Math.random().toString(36).substring(2, 15);
  return uploadToCloudinary(file, `nextbench/org_documents/${randomId}`);
}

/**
 * Uploads an avatar/profile picture for a club.
 */
export async function uploadClubAvatar(file: File, clubId: string): Promise<string> {
  return uploadToCloudinary(file, `nextbench/clubs/${clubId}`);
}

/**
 * Uploads a cover/banner photo for a user profile.
 */
export async function uploadCoverPhoto(file: File, userId: string): Promise<string> {
  return uploadToCloudinary(file, `nextbench/covers/${userId}`);
}

/**
 * Uploads an image attached to a post reply/comment.
 */
export async function uploadReplyImage(file: File): Promise<string> {
  const randomId = Math.random().toString(36).substring(2, 15);
  return uploadToCloudinary(file, `nextbench/replies/${randomId}`);
}

/**
 * Uploads a video for a community post to Firebase Storage.
 * Accepts an optional onProgress callback (0–100).
 */
export async function uploadPostVideo(file: File, onProgress?: UploadProgressCallback): Promise<string> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }
  const randomId = Math.random().toString(36).substring(2, 15);
  const fileExt = file.name.split('.').pop() || 'mp4';
  const fileName = `nextbench/post_videos/${randomId}_${Date.now()}.${fileExt}`;

  const storageRef = ref(storage, fileName);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct, snapshot.bytesTransferred, snapshot.totalBytes);
        }
      },
      (error) => reject(error),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}