import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace literal \n with actual newlines for the private key
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error', error.stack);
  }
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tokens, title, body, link } = req.body;

  if (!tokens || !tokens.length) {
    return res.status(400).json({ error: 'Missing FCM tokens' });
  }

  if (!process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: missing FIREBASE_PRIVATE_KEY' });
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
