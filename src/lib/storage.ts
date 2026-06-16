/**
 * Cloudinary Storage Helper
 * We use Cloudinary instead of Firebase Storage to keep the app 100% free
 * and avoid requiring a credit card for the Firebase Blaze plan.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * Generic upload function to Cloudinary via unauthenticated REST API.
 */
export async function uploadToCloudinary(file: File, folder: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary environment variables are missing.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to upload image.');
  }

  const data = await response.json();
  // Cloudinary returns a secure_url
  return data.secure_url;
}

/**
 * Uploads an image file to Cloudinary and returns the download URL.
 */
export async function uploadProductImage(file: File, userId: string): Promise<string> {
  return uploadToCloudinary(file, `nextbench/products/${userId}`);
}

/**
 * Uploads a profile picture to Cloudinary and returns the download URL.
 */
export async function uploadProfilePicture(file: File, userId: string): Promise<string> {
  return uploadToCloudinary(file, `nextbench/profiles/${userId}`);
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
export async function uploadPostImage(file: File): Promise<string> {
  const randomId = Math.random().toString(36).substring(2, 15);
  return uploadToCloudinary(file, `nextbench/posts/${randomId}`);
}

/**
 * Uploads a PDF for a community post via Cloudinary's image pipeline.
 * Returns { url, pages } so we can render each page as an image using
 * Cloudinary's pg_N transformation — no external PDF viewer needed.
 */
export async function uploadPostPdf(file: File): Promise<{ url: string; pages: number }> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary environment variables are missing.');
  }

  const randomId = Math.random().toString(36).substring(2, 15);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `nextbench/posts/pdf_${randomId}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to upload PDF.');
  }

  const data = await response.json();
  return { url: data.secure_url, pages: data.pages || 1 };
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