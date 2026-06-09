import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

function generateRandomCode(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const generateReferralCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const uid = request.auth.uid;
  const userRef = db.collection("users").doc(uid);

  return await db.runTransaction(async (t) => {
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User document does not exist.");
    }

    const userData = userDoc.data();
    if (userData?.referralCode) {
      return { code: userData.referralCode };
    }

    // Generate unique code
    let uniqueCode = "";
    let isUnique = false;
    while (!isUnique) {
      uniqueCode = generateRandomCode(8);
      const codeQuery = await t.get(db.collection("users").where("referralCode", "==", uniqueCode).limit(1));
      if (codeQuery.empty) {
        isUnique = true;
      }
    }

    t.update(userRef, {
      referralCode: uniqueCode,
      referralCount: userData?.referralCount ?? 0
    });

    return { code: uniqueCode };
  });
});

export const applyReferral = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const uid = request.auth.uid;
  const { referralCode } = request.data;

  if (!referralCode || typeof referralCode !== "string") {
    throw new HttpsError("invalid-argument", "Invalid referral code.");
  }

  return await db.runTransaction(async (t) => {
    // 1. Get current user
    const currentUserRef = db.collection("users").doc(uid);
    const currentUserDoc = await t.get(currentUserRef);

    if (!currentUserDoc.exists) {
      throw new HttpsError("not-found", "User document does not exist.");
    }

    const currentUserData = currentUserDoc.data()!;

    // 2. Reject if current user already has referredBy set
    if (currentUserData.referredBy) {
      throw new HttpsError("already-exists", "User has already used a referral code.");
    }

    // Reject if account is not new (optional, but requested: "Reject if current user account is not new")
    const createdAt = currentUserData.createdAt?.toDate();
    if (createdAt) {
      const now = new Date();
      const diffHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        throw new HttpsError("failed-precondition", "Referral codes can only be applied to new accounts.");
      }
    }

    // 3. Find referrer by code
    const referrerQuery = await t.get(db.collection("users").where("referralCode", "==", referralCode).limit(1));
    if (referrerQuery.empty) {
      throw new HttpsError("not-found", "Invalid referral code.");
    }

    const referrerDoc = referrerQuery.docs[0];
    const referrerId = referrerDoc.id;

    // 4. Reject if referrer UID equals current UID
    if (referrerId === uid) {
      throw new HttpsError("invalid-argument", "You cannot use your own referral code.");
    }

    // 5. Update docs
    t.update(currentUserRef, {
      referredBy: referrerId
    });

    const referrerRef = db.collection("users").doc(referrerId);
    const currentCount = referrerDoc.data()?.referralCount || 0;
    t.update(referrerRef, {
      referralCount: currentCount + 1
    });

    return { success: true };
  });
});
