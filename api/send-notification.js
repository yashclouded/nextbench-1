import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'nextbench-a11ed';
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
    console.error('Firebase Admin initialization error', error.stack);
  }
}

export default async function handler(req, res) {
  // CORS configuration
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
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Bearer Token (Authentication)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization token' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  const uid = decodedToken.uid;

  // Rate Limiting (max 10 notifications/minute per user)
  const db = admin.firestore();
  const rateLimitRef = db.collection('rate_limits').doc(`notifications_${uid}`);
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      if (!doc.exists) {
        transaction.set(rateLimitRef, {
          count: 1,
          windowStart: now,
        });
      } else {
        const data = doc.data();
        if (data.windowStart < oneMinuteAgo) {
          // Reset window
          transaction.update(rateLimitRef, {
            count: 1,
            windowStart: now,
          });
        } else {
          if (data.count >= 10) {
            throw new Error('RATE_LIMIT_EXCEEDED');
          }
          transaction.update(rateLimitRef, {
            count: data.count + 1,
          });
        }
      }
    });
  } catch (err) {
    if (err.message === 'RATE_LIMIT_EXCEEDED') {
      return res.status(429).json({ error: 'Too many notification requests. Limit is 10 per minute.' });
    }
    console.error('Rate limiting error:', err);
  }

  const { tokens, title, body, link } = req.body;

  if (!tokens || !tokens.length) {
    return res.status(400).json({ error: 'Missing FCM tokens' });
  }

  if (!process.env.FIREBASE_PRIVATE_KEY && !clientEmail) {
    // If running in local emulator or without service account, fallback message or error
    console.warn('Firebase Admin private key not configured for push notifications.');
  }

  try {
    const message = {
      notification: { title, body },
      data: { link: link || '/' },
      tokens: tokens, // Array of FCM tokens
      webpush: {
        notification: {
          icon: '/logo.png',
          requireInteraction: true,
        }
      }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    // Log failures (e.g. invalid/expired tokens)
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) failedTokens.push(tokens[idx]);
      });
      console.log('Failed to send to tokens:', failedTokens);
    }

    res.status(200).json({ success: true, response });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
}
