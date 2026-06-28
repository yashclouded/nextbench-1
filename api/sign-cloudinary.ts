import admin from 'firebase-admin';
import crypto from 'crypto';

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error('FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID environment variable is missing.');
    }
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      console.log('Firebase Admin initialized with service account.');
    } else {
      admin.initializeApp({ projectId });
      console.log('Firebase Admin initialized with default project ID.');
    }
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  const origin = req.headers.origin;
  if (origin) {
    const isAllowed = origin === 'https://nextbench.in' || 
                     (process.env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')));
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Verify Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error: any) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  const uid = decodedToken.uid;
  const { folder } = req.body;

  if (!folder || typeof folder !== 'string') {
    return res.status(400).json({ error: 'Bad Request: Missing or invalid folder parameter' });
  }

  // 2. Validate Folder (Ensure user can only upload to their own user directories or general shared directories)
  const isSelfProfile = folder === `nextbench/profiles/${uid}`;
  const isSelfCover = folder === `nextbench/covers/${uid}`;
  const isSelfProduct = folder === `nextbench/products/${uid}`;
  const isGeneralFolder = folder.startsWith('nextbench/chats/') || 
                          folder.startsWith('nextbench/posts/') || 
                          folder.startsWith('nextbench/replies/') ||
                          folder.startsWith('nextbench/school_requests/') ||
                          folder.startsWith('nextbench/org_documents/') ||
                          folder.startsWith('nextbench/clubs/');

  if (!isSelfProfile && !isSelfCover && !isSelfProduct && !isGeneralFolder) {
    return res.status(403).json({ error: 'Forbidden: Unauthorized folder path access' });
  }

  // 3. Generate Cloudinary Signature
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY;
  const uploadPreset = process.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!apiSecret || !apiKey || !uploadPreset) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Cloudinary credentials' });
  }

  const timestamp = Math.round(Date.now() / 1000);
  
  // Sort and sign parameters
  const paramsToSign = {
    folder,
    timestamp,
    upload_preset: uploadPreset,
  };

  const sortedKeys = Object.keys(paramsToSign).sort() as Array<keyof typeof paramsToSign>;
  const paramString = sortedKeys
    .map(key => `${key}=${paramsToSign[key]}`)
    .join('&');

  const signature = crypto
    .createHash('sha1')
    .update(paramString + apiSecret)
    .digest('hex');

  return res.status(200).json({
    signature,
    timestamp,
    apiKey,
    cloudName: process.env.VITE_CLOUDINARY_CLOUD_NAME,
    folder,
  });
}
