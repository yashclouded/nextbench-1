import admin from 'firebase-admin';

// Initialize Firebase Admin
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
    console.error('Firebase admin initialization error:', error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

// API Configurations
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HACKCLUB_API_KEY = process.env.HACKCLUB_API_KEY;

const HACKCLUB_ENDPOINT = 'https://ai.hackclub.com/proxy/v1/chat/completions';
const GOOGLE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Optimizes the Cloudinary URL to downsample the image size to w_600 and q_60 (JPEG).
 * This significantly reduces the size of the base64 payload (~30KB-50KB),
 * minimizing input tokens (tokenomics) and API latency.
 */
function getDownsampledUrl(url: string): string {
  if (url.includes('res.cloudinary.com')) {
    let optimized = url.replace(/\.(heic|heif)$/i, '.jpg');
    if (optimized.includes('/image/upload/') && !optimized.includes('f_jpg')) {
      optimized = optimized.replace('/image/upload/', '/image/upload/f_jpg,q_60,w_600,c_limit/');
    }
    return optimized;
  }
  return url;
}

/**
 * Downloads an image from a URL and converts it to base64 format for the Gemini API.
 */
async function downloadImageAsBase64(url: string): Promise<string> {
  const optimizedUrl = getDownsampledUrl(url);
  const response = await fetch(optimizedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image from ${optimizedUrl} (Status: ${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString('base64');
}

/**
 * Fetch helper with exponential backoff retry logic.
 */
async function fetchWithRetry(url: string, options: any, retries = 3, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        console.warn(`Rate limited (429). Retrying in ${delay * 2}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay * 2));
        delay *= 2;
        continue;
      }
      if (response.status >= 500) {
        console.warn(`Server error (${response.status}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5;
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Network/Fetch error: ${error}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 1.5;
    }
  }
  throw new Error(`Failed to fetch after ${retries} attempts`);
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, profileName, schoolName, idCardUrl, selfieUrl } = req.body;

  if (!uid || !profileName || !schoolName || !idCardUrl || !selfieUrl) {
    return res.status(400).json({ error: 'Missing required parameters (uid, profileName, schoolName, idCardUrl, selfieUrl)' });
  }

  if (!db) {
    console.error('Firestore admin DB not initialized');
    return res.status(500).json({ error: 'Database service is unavailable' });
  }

  // Soft-fail fallback if no API keys are configured at all
  if (!HACKCLUB_API_KEY && !GEMINI_API_KEY) {
    console.error('No API keys configured (both HACKCLUB_API_KEY and GEMINI_API_KEY are missing)');
    try {
      await db.collection('users').doc(uid).update({
        verificationStatus: 'pending',
        verified: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.status(200).json({
        success: false,
        verificationStatus: 'pending',
        reason: 'Verification service temporarily falling back to manual review (no keys configured).',
      });
    } catch (dbErr) {
      console.error('Failed to update status on missing keys error:', dbErr);
      return res.status(500).json({ error: 'Verification service configuration error' });
    }
  }

  try {
    console.log(`Starting automated verification for user ${uid} (${profileName})...`);

    // Download both images in parallel
    const [idImgBase64, selfieImgBase64] = await Promise.all([
      downloadImageAsBase64(idCardUrl),
      downloadImageAsBase64(selfieUrl),
    ]);

    console.log('Images downloaded successfully. Preparing verification payload...');

    const promptText = `
You are an AI security agent for "Nextbench", a verified student marketplace.
Your task is to verify the identity of a student by comparing their School ID Card image with their selfie.

Registered Profile Name: "${profileName}"
Registered School Name: "${schoolName}"

Please analyze the two attached images:
- First image is the student's School ID card.
- Second image is a live Selfie of the student.

Perform these checks:
1. **Face Match**: Verify if the face on the School ID card matches the face in the Selfie.
2. **Name Match**: Extract the student's name from the ID card. Does it match the Registered Profile Name? Allow minor variations/abbreviations (e.g. "Akshat Kumar" matches "Akshat" or "A. Kumar").
3. **School Match**: Extract the school/university name from the ID card. Does it match the Registered School Name? Allow common abbreviations.
4. **ID Authenticity**: Check if the ID card looks like a valid student ID and is not blurred, blank, or completely unrelated.
5. **Synthetic/AI Check (SynthID)**: Check if either image shows signs of synthetic generation, digital manipulation, AI face replacement, fake generated text, or GAN artifacts.

You must output a JSON object matching this schema. Do not output markdown code blocks. Output raw JSON.
{
  "isFaceMatch": boolean,
  "faceMatchConfidence": number, // 0.0 to 1.0
  "isNameMatch": boolean,
  "nameMatchConfidence": number, // 0.0 to 1.0
  "isSchoolMatch": boolean,
  "isIdAuthentic": boolean,
  "isSynthetic": boolean,
  "syntheticCheckConfidence": number,
  "extractedName": string,
  "extractedSchool": string,
  "isApproved": boolean,
  "rejectionReason": string
}

Only set "isApproved" to true if:
- isFaceMatch is true (faceMatchConfidence > 0.75)
- isNameMatch is true (nameMatchConfidence > 0.75)
- isIdAuthentic is true
- isSynthetic is false
- isSchoolMatch is true
`;

    let resultText = '';

    // Route 1: Prefer Hack Club AI (OpenAI Compatible Endpoint)
    if (HACKCLUB_API_KEY) {
      console.log('Routing request via Hack Club AI proxy (Gemini 2.5)...');
      const requestBody = {
        model: 'google/gemini-2.5-flash',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${idImgBase64}`
                }
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${selfieImgBase64}`
                }
              }
            ]
          }
        ]
      };

      const response = await fetchWithRetry(HACKCLUB_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HACKCLUB_API_KEY}`
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Hack Club AI proxy returned status ${response.status}: ${await response.text()}`);
      }

      const responseJson = await response.json();
      resultText = responseJson.choices?.[0]?.message?.content || '';
    } 
    // Route 2: Fallback to direct Google REST API
    else {
      console.log('Routing request via direct Google REST API (Gemini 2.5)...');
      const requestBody = {
        contents: [
          {
            parts: [
              { text: promptText },
              { inlineData: { mimeType: 'image/jpeg', data: idImgBase64 } },
              { inlineData: { mimeType: 'image/jpeg', data: selfieImgBase64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              isFaceMatch: { type: 'BOOLEAN' },
              faceMatchConfidence: { type: 'NUMBER' },
              isNameMatch: { type: 'BOOLEAN' },
              nameMatchConfidence: { type: 'NUMBER' },
              isSchoolMatch: { type: 'BOOLEAN' },
              isIdAuthentic: { type: 'BOOLEAN' },
              isSynthetic: { type: 'BOOLEAN' },
              syntheticCheckConfidence: { type: 'NUMBER' },
              extractedName: { type: 'STRING' },
              extractedSchool: { type: 'STRING' },
              isApproved: { type: 'BOOLEAN' },
              rejectionReason: { type: 'STRING' },
            },
            required: [
              'isFaceMatch',
              'faceMatchConfidence',
              'isNameMatch',
              'nameMatchConfidence',
              'isSchoolMatch',
              'isIdAuthentic',
              'isSynthetic',
              'syntheticCheckConfidence',
              'extractedName',
              'extractedSchool',
              'isApproved',
              'rejectionReason',
            ],
          },
        },
      };

      const response = await fetchWithRetry(GOOGLE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Google Gemini API returned status ${response.status}: ${await response.text()}`);
      }

      const responseJson = await response.json();
      resultText = responseJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (!resultText) {
      throw new Error('API returned an empty evaluation response.');
    }

    console.log('API Raw Response Text:', resultText);
    const result = JSON.parse(resultText.trim());

    let finalStatus: 'approved' | 'rejected' | 'flagged_manual' = 'flagged_manual';

    if (result.isApproved) {
      finalStatus = 'approved';
    } else {
      // Never automatically reject onboarding accounts; route them to the admin panel manual queue as flagged_manual
      finalStatus = 'flagged_manual';
    }

    console.log(`Verification result for ${uid}: isApproved=${result.isApproved}, finalStatus=${finalStatus}`);

    // Update Firestore user document
    const userUpdate: Record<string, any> = {
      verificationStatus: finalStatus,
      verified: finalStatus === 'approved',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (finalStatus !== 'approved') {
      userUpdate.verificationRejectionReason = result.rejectionReason || 'Verification check failed.';
    }

    await db.collection('users').doc(uid).update(userUpdate);

    // Create welcome notification if approved
    if (finalStatus === 'approved') {
      try {
        await db.collection('notifications').add({
          userId: uid,
          type: 'user_approved',
          title: 'Welcome to Nextbench!',
          message: 'Your account has been verified. You can now list and reserve items.',
          link: '/dashboard',
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (notifErr) {
        console.error('Failed to create notification for user approval:', notifErr);
      }
    }

    return res.status(200).json({
      success: true,
      verificationStatus: finalStatus,
      rejectionReason: result.rejectionReason || null,
      details: {
        isFaceMatch: result.isFaceMatch,
        faceMatchConfidence: result.faceMatchConfidence,
        isNameMatch: result.isNameMatch,
        nameMatchConfidence: result.nameMatchConfidence,
        isSchoolMatch: result.isSchoolMatch,
        isSynthetic: result.isSynthetic,
      },
    });

  } catch (error) {
    console.error('Verification flow error:', error);
    
    // SOFT-FAIL Fallback: If anything fails, route to standard 'pending' manual queue
    try {
      await db.collection('users').doc(uid).update({
        verificationStatus: 'pending',
        verified: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Successfully soft-failed user ${uid} to 'pending' manual queue.`);
    } catch (dbErr) {
      console.error('Failed to soft-fail user in Firestore:', dbErr);
    }

    return res.status(200).json({
      success: false,
      verificationStatus: 'pending',
      reason: 'Automated verification check encountered an issue. Queued for manual verification.',
    });
  }
}
