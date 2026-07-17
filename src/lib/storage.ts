/**
 * Cloudinary Storage Helper
 * We use Cloudinary instead of Firebase Storage to keep the app 100% free
 * and avoid requiring a credit card for the Firebase Blaze plan.
 */

import { storage, auth } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export type UploadProgressCallback = (progress: number, loaded: number, total: number) => void;



/**
 * Generic upload function to Cloudinary via authenticated/signed REST API.
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

export interface CloudinaryUploadResponse {
  url: string;
  width: number;
  height: number;
}

/**
 * Detailed upload function that returns the secure URL along with width and height.
 */
export async function uploadToCloudinaryDetailed(
  file: File,
  folder: string,
  onProgress?: UploadProgressCallback,
  resourceType: 'auto' | 'image' | 'video' | 'raw' = 'auto'
): Promise<CloudinaryUploadResponse> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary environment variables are missing.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  return new Promise<CloudinaryUploadResponse>((resolve, reject) => {
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
          resolve({
            url: data.secure_url,
            width: data.width || 0,
            height: data.height || 0,
          });
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
 * Uploads a product image returning URL, width, and height.
 */
export async function uploadProductImageDetailed(file: File, userId: string, onProgress?: UploadProgressCallback): Promise<CloudinaryUploadResponse> {
  return uploadToCloudinaryDetailed(file, `nextbench/products/${userId}`, onProgress);
}

/**
 * Uploads a post image returning URL, width, and height.
 */
export async function uploadPostImageDetailed(file: File, onProgress?: UploadProgressCallback): Promise<CloudinaryUploadResponse> {
  const randomId = Math.random().toString(36).substring(2, 15);
  return uploadToCloudinaryDetailed(file, `nextbench/posts/${randomId}`, onProgress);
}

/**
 * Uploads a chat image returning URL, width, and height.
 */
export async function uploadChatImageDetailed(file: File, roomId: string): Promise<CloudinaryUploadResponse> {
  return uploadToCloudinaryDetailed(file, `nextbench/chats/${roomId}`);
}

/**
 * Uploads an arbitrary chat file (PDF, doc, zip, etc.) to Cloudinary.
 * PDFs go through the `image` endpoint so the existing PdfViewer page-transform
 * URLs work and Cloudinary returns a page count; everything else uses `raw`.
 * Returns the download URL, and `pages` for PDFs.
 */
export async function uploadChatFile(
  file: File,
  roomId: string,
  onProgress?: UploadProgressCallback,
): Promise<{ url: string; pages?: number }> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary environment variables are missing.');
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const resourceType = isPdf ? 'image' : 'raw';
  const folder = `nextbench/chat_files/${roomId}`;

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', folder);

    const xhr = new XMLHttpRequest();
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
      });
    }
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.secure_url, pages: data.pages });
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
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted.')));
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
  const folder = `nextbench/posts/pdf_${randomId}`;

  return new Promise<{ url: string; pages: number }>((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', folder);

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
    throw new Error('Firebase Storage is not initialized. Check your VITE_FIREBASE_STORAGE_BUCKET env variable.');
  }
  const randomId = Math.random().toString(36).substring(2, 15);
  const fileExt = file.name.split('.').pop() || 'mp4';
  const fileName = `nextbench/post_videos/${randomId}_${Date.now()}.${fileExt}`;

  // storage is non-null here (checked above)
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

/**
 * Uploads a chat video to Firebase Storage under nextbench/chat_videos/{roomId}/.
 * Mirrors uploadPostVideo (resumable + progress). Returns the download URL.
 */
export async function uploadChatVideo(file: File | Blob, roomId: string, onProgress?: UploadProgressCallback): Promise<string> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized. Check your VITE_FIREBASE_STORAGE_BUCKET env variable.');
  }
  const randomId = Math.random().toString(36).substring(2, 15);
  const fileExt = (file instanceof File ? file.name.split('.').pop() : '') || 'mp4';
  const fileName = `nextbench/chat_videos/${roomId}/${randomId}_${Date.now()}.${fileExt}`;
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
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/**
 * Uploads a chat video's poster frame (JPEG blob) to Firebase Storage under
 * nextbench/chat_video_posters/{roomId}/. Returns the download URL.
 */
export async function uploadChatVideoPoster(blob: Blob, roomId: string): Promise<string> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized. Check your VITE_FIREBASE_STORAGE_BUCKET env variable.');
  }
  const randomId = Math.random().toString(36).substring(2, 15);
  const fileName = `nextbench/chat_video_posters/${roomId}/${randomId}_${Date.now()}.jpg`;
  const storageRef = ref(storage, fileName);
  const task = uploadBytesResumable(storageRef, blob);
  await task;
  return getDownloadURL(task.snapshot.ref);
}