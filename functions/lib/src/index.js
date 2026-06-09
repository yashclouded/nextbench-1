"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyReferral = exports.generateReferralCode = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
function generateRandomCode(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
exports.generateReferralCode = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    }
    const uid = context.auth.uid;
    const userRef = db.collection("users").doc(uid);
    return await db.runTransaction(async (t) => {
        var _a;
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("not-found", "User document does not exist.");
        }
        const userData = userDoc.data();
        if (userData === null || userData === void 0 ? void 0 : userData.referralCode) {
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
            referralCount: (_a = userData === null || userData === void 0 ? void 0 : userData.referralCount) !== null && _a !== void 0 ? _a : 0
        });
        return { code: uniqueCode };
    });
});
exports.applyReferral = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    }
    const uid = context.auth.uid;
    const { referralCode } = data;
    if (!referralCode || typeof referralCode !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Invalid referral code.");
    }
    return await db.runTransaction(async (t) => {
        var _a, _b;
        // 1. Get current user
        const currentUserRef = db.collection("users").doc(uid);
        const currentUserDoc = await t.get(currentUserRef);
        if (!currentUserDoc.exists) {
            throw new functions.https.HttpsError("not-found", "User document does not exist.");
        }
        const currentUserData = currentUserDoc.data();
        // 2. Reject if current user already has referredBy set
        if (currentUserData.referredBy) {
            throw new functions.https.HttpsError("already-exists", "User has already used a referral code.");
        }
        // Reject if account is not new (optional, but requested: "Reject if current user account is not new")
        const createdAt = (_a = currentUserData.createdAt) === null || _a === void 0 ? void 0 : _a.toDate();
        if (createdAt) {
            const now = new Date();
            const diffHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            if (diffHours > 24) {
                throw new functions.https.HttpsError("failed-precondition", "Referral codes can only be applied to new accounts.");
            }
        }
        // 3. Find referrer by code
        const referrerQuery = await t.get(db.collection("users").where("referralCode", "==", referralCode).limit(1));
        if (referrerQuery.empty) {
            throw new functions.https.HttpsError("not-found", "Invalid referral code.");
        }
        const referrerDoc = referrerQuery.docs[0];
        const referrerId = referrerDoc.id;
        // 4. Reject if referrer UID equals current UID
        if (referrerId === uid) {
            throw new functions.https.HttpsError("invalid-argument", "You cannot use your own referral code.");
        }
        // 5. Update docs
        t.update(currentUserRef, {
            referredBy: referrerId
        });
        const referrerRef = db.collection("users").doc(referrerId);
        const currentCount = ((_b = referrerDoc.data()) === null || _b === void 0 ? void 0 : _b.referralCount) || 0;
        t.update(referrerRef, {
            referralCount: currentCount + 1
        });
        return { success: true };
    });
});
//# sourceMappingURL=index.js.map