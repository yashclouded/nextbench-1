import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";

admin.initializeApp();
const db = admin.firestore();

/** Allowed origins — explicit list is more reliable than `cors: CORS_ORIGINS` for error responses */
const CORS_ORIGINS = [
  "https://www.nextbench.in",
  "https://nextbench.in",
  "https://nextbench-a11ed.web.app",
  "https://nextbench-a11ed.firebaseapp.com",
  // Local dev
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
];


type PublicUser = {
  id: string;
  name?: string;
  username?: string;
  school?: string;
  city?: string;
  about?: string | null;
  profilePicture?: string | null;
  coverPhoto?: string | null;
  verified?: boolean;
  reputation?: number;
  accountType?: string;
  orgName?: string;
};

type SerializedDoc = Record<string, unknown>;

function assertAuthedUid(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return uid;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) return value.toMillis();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    const out: SerializedDoc = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeValue(nested);
    }
    return out;
  }
  return value;
}

function serializeDoc(doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot): SerializedDoc {
  const data = doc.data() || {};
  return { id: doc.id, ...serializeValue(data) as SerializedDoc };
}

function publicUserFromDoc(doc: admin.firestore.DocumentSnapshot): PublicUser | null {
  if (!doc.exists) return null;
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: typeof data.name === "string" ? data.name : undefined,
    username: typeof data.username === "string" ? data.username : undefined,
    school: typeof data.school === "string" ? data.school : undefined,
    city: typeof data.city === "string" ? data.city : undefined,
    about: typeof data.about === "string" ? data.about : null,
    profilePicture: typeof data.profilePicture === "string" ? data.profilePicture : null,
    coverPhoto: typeof data.coverPhoto === "string" ? data.coverPhoto : null,
    verified: data.verified === true,
    reputation: typeof data.reputation === "number" ? data.reputation : undefined,
    accountType: typeof data.accountType === "string" ? data.accountType : undefined,
    orgName: typeof data.orgName === "string" ? data.orgName : undefined,
  };
}

async function blockSetFor(uid: string): Promise<Set<string>> {
  const [blockedSnap, blockedBySnap] = await Promise.all([
    db.collection("blocks").where("blockerId", "==", uid).get(),
    db.collection("blocks").where("blockedId", "==", uid).get(),
  ]);
  const ids = new Set<string>();
  blockedSnap.forEach((d) => {
    const blockedId = d.get("blockedId");
    if (typeof blockedId === "string") ids.add(blockedId);
  });
  blockedBySnap.forEach((d) => {
    const blockerId = d.get("blockerId");
    if (typeof blockerId === "string") ids.add(blockerId);
  });
  return ids;
}

async function hasBlockRelationship(uid1: string, uid2: string): Promise<boolean> {
  if (!uid1 || !uid2 || uid1 === uid2) return false;
  const [aBlocksB, bBlocksA] = await Promise.all([
    db.collection("blocks").doc(`${uid1}_${uid2}`).get(),
    db.collection("blocks").doc(`${uid2}_${uid1}`).get(),
  ]);
  return aBlocksB.exists || bBlocksA.exists;
}

async function deleteQueryDocs(queryRef: admin.firestore.Query): Promise<number> {
  const snap = await queryRef.get();
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + 450);
    chunk.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

function normalizeSearchTerm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 80) : "";
}

function matchesSearch(value: unknown, term: string): boolean {
  return typeof value === "string" && value.toLowerCase().includes(term);
}

function docMillis(doc: admin.firestore.QueryDocumentSnapshot, field: string): number {
  const value = doc.get(field);
  return value instanceof admin.firestore.Timestamp ? value.toMillis() : 0;
}

// ─── Secrets (set via: firebase functions:secrets:set SECRET_NAME) ───────────
const EMAIL_USER      = defineSecret("EMAIL_USER");
const EMAIL_PASS      = defineSecret("EMAIL_PASS");
const OTP_HMAC_SECRET = defineSecret("OTP_HMAC_SECRET");

// ─── Disposable / Temp-mail domain blocklist ─────────────────────────────────
const TEMP_MAIL_DOMAINS = new Set([
  // Major disposable providers
  "mailinator.com","guerrillamail.com","guerrillamail.net","guerrillamail.org",
  "guerrillamail.biz","guerrillamail.de","guerrillamail.info",
  "10minutemail.com","10minutemail.net","10minutemail.org","10minutemail.de",
  "10minutemail.co.uk","10minutemail.co.za","10minutemail.pl","10minutemail.ru",
  "yopmail.com","yopmail.fr","cool.fr.nf","jetable.fr.nf","nospam.ze.tc",
  "nomail.xl.cx","mega.zik.dj","speed.1s.fr","courriel.fr.nf","moncourrier.fr.nf",
  "monemail.fr.nf","monmail.fr.nf","dispostable.com","fakeinbox.com",
  "trashmail.com","trashmail.net","trashmail.org","trashmail.at","trashmail.io",
  "trashmail.me","trashmail.xyz","throwam.com","throwam.net",
  "sharklasers.com","guerrillamailblock.com","grr.la","guerrillamail.info",
  "spam4.me","spamgourmet.com","spamgourmet.net","spamgourmet.org",
  "mailnull.com","maildrop.cc","mailnesia.com","mailnull.com",
  "mohmal.com","mohmal.im","tempr.email","discard.email",
  "mintemail.com","getnada.com","nada.email","nada.ltd",
  "jetable.fr","jetable.net","jetable.org","jetable.pp.ua",
  "anonaddy.com","anonaddy.me","anonaddy.io",
  "spamfree24.org","spamfree24.de","spamfree24.eu","spamfree24.info",
  "spamfree24.biz","spamfree24.com","spamfree.eu",
  "deadaddress.com","deadletter.ga","deathmail.net",
  "mytrashmail.com","meltmail.com","filzmail.com",
  "tempinbox.com","tempinbox.co.uk","tempmail.com","tempmail.net",
  "tempomail.fr","temporaryemail.com","temporaryforwarding.com",
  "trash2009.com","trash2010.com","trash2011.com",
  "trash-mail.at","trash-mail.com","trash-mail.de","trash-mail.io",
  "crazymailing.com","dontreg.com","dontsendmeemail.com",
  "easytrashmail.com","emailwarden.com","etranquil.com","etranquil.net",
  "etranquil.org","fastacura.com","fastchevy.com","fastchrysler.com",
  "fastkawasaki.com","fastmazda.com","fastmitsubishi.com","fastnissan.com",
  "fastsubaru.com","fastsuzuki.com","fasttoyota.com","fastyamaha.com",
  "filbert8.com","fivemail.de","fleckens.hu","freemail.ms",
  "fux0ringduh.com","get1mail.com","get2mail.fr","getonemail.com",
  "getonemail.net","ghosttexter.de","givmail.com","haltospam.com",
  "herp.in","hidebox.org","hidemail.de","hidemail.pro","hochsitze.com",
  "hotpop.com","hulapla.de","ieatspam.eu","ieatspam.info","imails.info",
  "inoutmail.de","inoutmail.eu","inoutmail.info","inoutmail.net",
  "insorg.org","instant-email.org","ipoo.org","irish2me.com",
  "iwi.net","jetable.com","jnxjn.com","joker.com","jsrsolutions.com",
  "kasmail.com","kaspop.com","killmail.com","killmail.net",
  "kir.ch.tc","klassmaster.com","klassmaster.net","klzlk.com",
  "koszmail.pl","kulturbetrieb.info","kurzepost.de","letthemeatspam.com",
  "lhsdv.com","libox.fr","lifebyfood.com","link2mail.net",
  "litedrop.com","lol.ovpn.to","lookugly.com","lopl.co.cc",
  "lortemail.dk","lovemeleaveme.com","lr7.us","lr78.com",
  "lukop.dk","m21.cc","mail-filter.com","mail-temporaire.fr",
  "mail.by","mail4trash.com","mailbidon.com","mailbiz.biz",
  "mailblocks.com","mailbucket.org","mailcat.biz","mailcatch.com",
  "maildrop.ga","maildu.de","maileater.com","mailexpire.com",
  "mailfa.tk","mailforspam.com","mailfreeonline.com","mailguard.me",
  "mailimate.com","mailme.ir","mailme.lv","mailme24.com",
  "mailmetrash.com","mailmoat.com","mailms.com","mailnew.com",
  "mailnull.com","mailorg.org","mailpick.biz","mailproxsy.com",
  "mailquack.com","mailrock.biz","mailscrap.com","mailshell.com",
  "mailsiphon.com","mailslapping.com","mailslife.com","mailspeed.de",
  "mailtemporar.ro","mailtemporaire.com","mailtemporaire.fr",
  "mailtome.de","mailtothis.com","mailttruck.com","mailzilla.com",
  "mailzilla.org","mbx.cc","mega.zik.dj","meinspamschutz.de",
  "meltmail.com","messagebeamer.de","mfsa.ru","mierdamail.com",
  "migumail.com","mindless.com","mjukglass.nu","moncourrier.fr.nf",
  "monemail.fr.nf","monmail.fr.nf","moy.so","mt2009.com",
  "mt2014.com","mx0.wwwnew.eu","my10minutemail.com","mypartyclip.de",
  "myphantomemail.com","mysamp.de","myspaceinc.com","myspaceinc.net",
  "myspaceinc.org","myspacepimpedup.com","myspamless.com",
  "mytemp.email","mytrashmail.com",
  // Common typosquatting patterns
  "gmailnot.com","yahooo.com","outloook.com",
]);

function isTempMail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  return TEMP_MAIL_DOMAINS.has(domain);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ─── Hashing Utilities ────────────────────────────────────────────────────────
function hashWithSecret(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function hashEmail(email: string, secret: string): string {
  return hashWithSecret(email.toLowerCase().trim(), secret);
}

function hashOtp(otp: string, secret: string): string {
  return hashWithSecret(otp, secret);
}

// ─── OTP Generation ───────────────────────────────────────────────────────────
function generateOtp(): string {
  // crypto.randomInt is cryptographically secure
  return String(crypto.randomInt(100000, 999999));
}

// ─── Email Sending ────────────────────────────────────────────────────────────
async function sendOtpEmail(to: string, otp: string, emailUser: string, emailPass: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: { user: "resend", pass: emailPass },
  });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your Nextbench OTP</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1a6b5e;padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:300;letter-spacing:0.1em;">NEXTBENCH</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;">Secured Campus Network</p>
            </td>
          </tr>
          <tr>
            <td style="padding:48px 40px 32px;text-align:center;">
              <p style="margin:0 0 8px;color:#1a6b5e;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Your Verification Code</p>
              <h2 style="margin:0 0 24px;color:#0f1a18;font-size:48px;font-weight:300;letter-spacing:0.15em;font-family:Georgia,serif;">${otp}</h2>
              <p style="margin:0 0 32px;color:#6b7a76;font-size:13px;line-height:1.6;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.<br/>If you didn't request this, ignore this email — your account is safe.</p>
              <div style="border-top:1px solid #f0f0ee;padding-top:24px;">
                <p style="margin:0;color:#aab0ae;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">Nextbench — For Students, By Students</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Nextbench" <${emailUser}>`,
    to,
    subject: `${otp} is your Nextbench code`,
    html,
    text: `Your Nextbench verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
  });
}

// ─── Cloud Function: sendAuthOtpEmail ─────────────────────────────────────────────
export const sendAuthOtpEmail = onCall(
  { secrets: [EMAIL_USER, EMAIL_PASS, OTP_HMAC_SECRET], invoker: "public", cors: CORS_ORIGINS },
  async (request) => {
    const rawEmail = (request.data?.email || "").toString().trim().toLowerCase();

    // 1. Validate email
    if (!isValidEmail(rawEmail)) {
      throw new HttpsError("invalid-argument", "Please enter a valid email address.");
    }

    // 2. Block temp / disposable emails
    if (isTempMail(rawEmail)) {
      throw new HttpsError(
        "invalid-argument",
        "Disposable or temporary email addresses are not allowed. Please use your real email."
      );
    }

    const secret = OTP_HMAC_SECRET.value();
    const emailHash = hashEmail(rawEmail, secret);

    // 3. Rate limit: max 3 sends per 60-minute window
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const limitRef = db.collection("emailOtpRateLimits").doc(emailHash);

    await db.runTransaction(async (tx) => {
      const limitDoc = await tx.get(limitRef);
      if (limitDoc.exists) {
        const data = limitDoc.data()!;
        const windowStart = data.windowStart?.toMillis() ?? 0;
        const count = data.count ?? 0;
        if (now - windowStart < windowMs) {
          if (count >= 3) {
            throw new HttpsError(
              "resource-exhausted",
              "Too many OTP requests. Please wait before requesting another code."
            );
          }
          tx.update(limitRef, { count: count + 1 });
        } else {
          // Reset window
          tx.set(limitRef, { count: 1, windowStart: admin.firestore.Timestamp.fromMillis(now) });
        }
      } else {
        tx.set(limitRef, { count: 1, windowStart: admin.firestore.Timestamp.fromMillis(now) });
      }
    });

    // 4. Generate OTP and store hash
    const otp = generateOtp();
    const otpHash = hashOtp(otp, secret);
    const expiresAt = admin.firestore.Timestamp.fromMillis(now + 10 * 60 * 1000); // 10 min

    await db.collection("emailOtpTokens").doc(emailHash).set({
      otpHash,
      expiresAt,
      attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. Send email
    try {
      await sendOtpEmail(rawEmail, otp, EMAIL_USER.value(), EMAIL_PASS.value());
    } catch (emailErr: any) {
      console.error("[sendEmailOTP] Failed to send email:", emailErr);
      throw new HttpsError("internal", "Failed to send verification email. Please try again.");
    }

    return { success: true };
  }
);

// ─── Cloud Function: verifyAuthOtpEmail ──────────────────────────────────────────
export const verifyAuthOtpEmail = onCall(
  { secrets: [OTP_HMAC_SECRET], invoker: "public", cors: CORS_ORIGINS },
  async (request) => {
    const rawEmail  = (request.data?.email  || "").toString().trim().toLowerCase();
    const rawOtp    = (request.data?.otp    || "").toString().trim();
    const isSignup  = Boolean(request.data?.isSignup);
    const signupData = request.data?.signupData ?? {};

    // Validate inputs
    if (!isValidEmail(rawEmail)) {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }
    if (!/^\d{6}$/.test(rawOtp)) {
      throw new HttpsError("invalid-argument", "OTP must be exactly 6 digits.");
    }

    const secret = OTP_HMAC_SECRET.value();
    const emailHash = hashEmail(rawEmail, secret);
    const tokenRef = db.collection("emailOtpTokens").doc(emailHash);

    // Load and validate token doc inside a transaction to prevent race conditions
    let isNewUser = false;

    await db.runTransaction(async (tx) => {
      const tokenDoc = await tx.get(tokenRef);

      if (!tokenDoc.exists) {
        throw new HttpsError("not-found", "OTP not found or expired. Please request a new code.");
      }

      const tokenData = tokenDoc.data()!;
      const expiresAt = tokenData.expiresAt?.toMillis() ?? 0;
      const attempts  = tokenData.attempts ?? 0;

      // Check expiry
      if (Date.now() > expiresAt) {
        tx.delete(tokenRef);
        throw new HttpsError("deadline-exceeded", "OTP has expired. Please request a new code.");
      }

      // Check attempt limit (5 max)
      if (attempts >= 5) {
        tx.delete(tokenRef);
        throw new HttpsError("resource-exhausted", "Too many failed attempts. Please request a new OTP.");
      }

      // Verify OTP hash
      const expectedHash = hashOtp(rawOtp, secret);
      if (expectedHash !== tokenData.otpHash) {
        tx.update(tokenRef, { attempts: attempts + 1 });
        const remaining = 5 - (attempts + 1);
        throw new HttpsError(
          "unauthenticated",
          remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            : "Too many failed attempts. Please request a new OTP."
        );
      }

      // OTP is correct — delete token
      tx.delete(tokenRef);
    });

    // ── Lookup/create Firebase Auth user ──────────────────────────────────────
    let uid: string;

    try {
      const existingUser = await admin.auth().getUserByEmail(rawEmail);
      uid = existingUser.uid;

      // Mark email as verified in Firebase Auth
      await admin.auth().updateUser(uid, { emailVerified: true });
      isNewUser = false;
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        if (!isSignup) {
          // Login flow — no account exists
          throw new HttpsError(
            "not-found",
            "No account found for this email. Please sign up first."
          );
        }

        // Signup flow — create new Firebase Auth user
        const displayName = signupData.name || rawEmail.split("@")[0];
        const newUser = await admin.auth().createUser({
          email: rawEmail,
          emailVerified: true,
          displayName,
        });
        uid = newUser.uid;
        isNewUser = true;

        // Create Firestore user document
        const school = signupData.school || "";
        const city   = signupData.city   || "Lucknow";
        const userDocRef = db.collection("users").doc(uid);
        await userDocRef.set({
          name: displayName,
          email: rawEmail,
          school,
          city,
          verified: false,
          verificationStatus: "pending",
          reputation: 5.0,
          isAdmin: false,
          profilePicture: null,
          idCardUrl: null,
          selfieUrl: null,
          about: null,
          accountType: "student",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Apply referral code if provided
        if (signupData.referralCode) {
          try {
            const refSnap = await db
              .collection("users")
              .where("referralCode", "==", signupData.referralCode.toUpperCase())
              .limit(1)
              .get();
            if (!refSnap.empty) {
              const referrerId = refSnap.docs[0].id;
              const batch = db.batch();
              batch.update(userDocRef, { referredBy: referrerId });
              batch.set(db.collection("users").doc(referrerId).collection("referrals").doc(uid), {
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
              await batch.commit();
            }
          } catch (refErr) {
            console.warn("[verifyEmailOTP] Referral application failed:", refErr);
          }
        }
      } else {
        throw err;
      }
    }

    // Preferred path: mint a custom token so the client can sign in without
    // touching the user's password. This requires the function's service account
    // to have the "Service Account Token Creator" role (iam.serviceAccounts.signBlob).
    try {
      const customToken = await admin.auth().createCustomToken(uid);
      return { customToken, email: rawEmail, isNewUser };
    } catch (tokenErr) {
      // Fallback (legacy behavior): if custom-token signing is unavailable (missing
      // IAM signBlob permission), rotate to a strong random password and let the
      // client log in via Email/Password. Kept so login never breaks while the IAM
      // role is being provisioned. See thingstofix.md 8.1.
      console.error(
        "[verifyAuthOtpEmail] createCustomToken failed, falling back to password login. " +
        "Grant the function service account the 'Service Account Token Creator' role to remove this fallback.",
        tokenErr
      );
      const loginPassword = crypto.randomBytes(32).toString("hex");
      await admin.auth().updateUser(uid, { password: loginPassword });
      return { loginPassword, email: rawEmail, isNewUser };
    }
  }
);

// ─── Existing: generateReferralCode ──────────────────────────────────────────
function generateRandomCode(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const createInviteCode = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
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

    let uniqueCode = "";
    let isUnique = false;
    while (!isUnique) {
      uniqueCode = generateRandomCode(8);
      const codeQuery = await t.get(
        db.collection("users").where("referralCode", "==", uniqueCode).limit(1)
      );
      if (codeQuery.empty) {
        isUnique = true;
      }
    }

    t.update(userRef, {
      referralCode: uniqueCode,
      referralCount: userData?.referralCount ?? 0,
    });

    return { code: uniqueCode };
  });
});

// ─── Existing: submitInviteCode ──────────────────────────────────────────────────
export const submitInviteCode = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const uid = request.auth.uid;
  const { referralCode } = request.data;

  if (!referralCode || typeof referralCode !== "string") {
    throw new HttpsError("invalid-argument", "Invalid referral code.");
  }

  return await db.runTransaction(async (t) => {
    const currentUserRef = db.collection("users").doc(uid);
    const currentUserDoc = await t.get(currentUserRef);

    if (!currentUserDoc.exists) {
      throw new HttpsError("not-found", "User document does not exist.");
    }

    const currentUserData = currentUserDoc.data()!;

    if (currentUserData.referredBy) {
      throw new HttpsError("already-exists", "User has already used a referral code.");
    }

    const createdAt = currentUserData.createdAt?.toDate();
    if (createdAt) {
      const diffHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        throw new HttpsError(
          "failed-precondition",
          "Referral codes can only be applied to new accounts."
        );
      }
    }

    const referrerQuery = await t.get(
      db.collection("users").where("referralCode", "==", referralCode).limit(1)
    );
    if (referrerQuery.empty) {
      throw new HttpsError("not-found", "Invalid referral code.");
    }

    const referrerDoc = referrerQuery.docs[0];
    const referrerId = referrerDoc.id;

    if (referrerId === uid) {
      throw new HttpsError("invalid-argument", "You cannot use your own referral code.");
    }


    t.update(currentUserRef, { referredBy: referrerId });
    const referrerRef = db.collection("users").doc(referrerId);
    const currentCount = referrerDoc.data()?.referralCount || 0;
    t.update(referrerRef, { referralCount: currentCount + 1 });

    return { success: true };
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── EMAIL NOTIFICATION SYSTEM ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const APP_URL = "https://www.nextbench.in";
const FROM_ADDRESS = '"Nextbench" <hello@nextbench.in>';
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between emails per user
const DAILY_LIMIT_MS = 22 * 60 * 60 * 1000; // 22 hours (daily cap)

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function getTransporter(emailPass: string) {
  return nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: { user: "resend", pass: emailPass },
  });
}

async function canSendEmail(userId: string): Promise<{ ok: boolean; email: string | null; firstName: string }> {
  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) return { ok: false, email: null, firstName: "there" };
  const data = userSnap.data()!;

  if (data.emailOptOut === true) return { ok: false, email: null, firstName: data.name?.split(" ")[0] || "there" };
  if (!data.email) return { ok: false, email: null, firstName: data.name?.split(" ")[0] || "there" };
  if (data.online === true) return { ok: false, email: data.email, firstName: data.name?.split(" ")[0] || "there" };

  const lastEmail = data.lastEmailNotification?.toMillis?.() ?? 0;
  const msSince = Date.now() - lastEmail;
  if (msSince < COOLDOWN_MS) return { ok: false, email: data.email, firstName: data.name?.split(" ")[0] || "there" };

  return { ok: true, email: data.email, firstName: data.name?.split(" ")[0] || "there" };
}

async function markEmailSent(userId: string) {
  await db.collection("users").doc(userId).update({
    lastEmailNotification: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Shared Email Template Builder ────────────────────────────────────────────

function buildEmailHtml(opts: {
  preheader?: string;
  headerBadge: string;
  greeting: string;
  bodyHtml: string;
  ctaUrl: string;
  ctaText: string;
  unsubscribeUserId: string;
}): string {
  const unsubscribeUrl = `${APP_URL}/unsubscribe?uid=${opts.unsubscribeUserId}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light"/>
  <title>Nextbench</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f0f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<!-- Preheader -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${opts.preheader || opts.greeting}</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4f3;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <!-- Logo Row -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#1a6b5e;border-radius:12px;padding:12px 24px;">
                  <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.08em;">NEXTBENCH</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">

            <!-- Header stripe -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:linear-gradient(135deg,#1a6b5e 0%,#2d9e8a 100%);padding:32px 40px;">
                  <p style="margin:0 0 8px;color:rgba(255,255,255,0.65);font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">${opts.headerBadge}</p>
                  <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.3;">${opts.greeting}</h1>
                </td>
              </tr>
            </table>

            <!-- Body -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:36px 40px;">
                  ${opts.bodyHtml}

                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">
                    <tr>
                      <td align="center">
                        <a href="${opts.ctaUrl}"
                           style="display:inline-block;background:#1a6b5e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;letter-spacing:0.02em;">
                          ${opts.ctaText}
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 8px;text-align:center;">
            <p style="margin:0 0 8px;color:#8a9e98;font-size:12px;line-height:1.6;">
              You're receiving this because you have an account on Nextbench.<br/>
              Only verified students, only real schools. 🎓
            </p>
            <p style="margin:0;">
              <a href="${unsubscribeUrl}" style="color:#8a9e98;font-size:11px;text-decoration:underline;">Unsubscribe from emails</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─── Email #1: Unread DM Notification ─────────────────────────────────────────

export const notifyOnNewMessage = onDocumentCreated(
  { document: "chatRooms/{roomId}/messages/{messageId}", secrets: [EMAIL_PASS] },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const msgData = snapshot.data();
    const senderId: string = msgData.senderId;
    if (!senderId) return;

    const roomId = event.params.roomId;
    const roomSnap = await db.collection("chatRooms").doc(roomId).get();
    if (!roomSnap.exists) return;

    const participants: string[] = roomSnap.data()?.participants || [];
    const receiverId = participants.find((id) => id !== senderId);
    if (!receiverId) return;

    const { ok, email, firstName } = await canSendEmail(receiverId);
    if (!ok || !email) return;

    const senderSnap = await db.collection("users").doc(senderId).get();
    const senderName = senderSnap.data()?.name || "Someone";

    const preview = msgData.text
      ? msgData.text.substring(0, 120)
      : msgData.image
        ? "📷 Sent you an image"
        : msgData.sharedPost
          ? `📋 Shared: ${msgData.sharedPost.title || "a post"}`
          : "Sent you a message";

    const html = buildEmailHtml({
      preheader: `${senderName}: ${preview}`,
      headerBadge: "💬 New Message",
      greeting: `Hey ${firstName}!`,
      bodyHtml: `
        <p style="margin:0 0 20px;font-size:16px;color:#374140;line-height:1.7;">
          <strong style="color:#1a6b5e;">${senderName}</strong> just sent you a message on Nextbench and is waiting for your reply.
        </p>
        <div style="background:#f5f8f7;border-left:4px solid #1a6b5e;padding:16px 20px;border-radius:0 12px 12px 0;margin-bottom:8px;">
          <p style="margin:0;font-size:15px;color:#374140;line-height:1.6;font-style:italic;">"${preview}"</p>
        </div>
        <p style="margin:12px 0 0;font-size:13px;color:#8a9e98;">Don't leave them hanging — tap below to reply 👇</p>
      `,
      ctaUrl: `${APP_URL}/dashboard/messages`,
      ctaText: "Reply to ${senderName} →",
      unsubscribeUserId: receiverId,
    });

    try {
      await getTransporter(EMAIL_PASS.value()).sendMail({
        from: FROM_ADDRESS,
        to: email,
        subject: `${senderName} messaged you on Nextbench 💬`,
        html,
      });
      await markEmailSent(receiverId);
      console.log(`[DM email] sent to ${email}`);
    } catch (err) {
      console.error("[DM email] failed:", err);
    }
  }
);

// ─── Email #2: Product Reserved Alert ─────────────────────────────────────────

export const notifyOnProductReserved = onDocumentUpdated(
  { document: "products/{productId}", secrets: [EMAIL_PASS] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only fire when status changes TO 'reserved'
    if (before.status === after.status || after.status !== "reserved") return;

    const sellerId: string = after.sellerId;
    const buyerId: string = after.reservedById;
    if (!sellerId || !buyerId) return;

    const { ok, email, firstName } = await canSendEmail(sellerId);
    if (!ok || !email) return;

    const buyerSnap = await db.collection("users").doc(buyerId).get();
    const buyerName = buyerSnap.data()?.name || "A student";
    const productId = event.params.productId;

    const html = buildEmailHtml({
      preheader: `${buyerName} just reserved your listing!`,
      headerBadge: "🎉 Item Reserved",
      greeting: `Great news, ${firstName}!`,
      bodyHtml: `
        <p style="margin:0 0 20px;font-size:16px;color:#374140;line-height:1.7;">
          <strong style="color:#1a6b5e;">${buyerName}</strong> just reserved your listing on Nextbench:
        </p>
        <div style="background:#f5f8f7;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#1a1a1a;">${after.title}</p>
          <p style="margin:0;font-size:16px;color:#1a6b5e;font-weight:600;">₹${after.price}</p>
        </div>
        <p style="margin:0 0 8px;font-size:15px;color:#374140;line-height:1.7;">
          They've locked in your item — time to coordinate the meetup and close the deal! 💼
        </p>
        <p style="margin:0;font-size:13px;color:#8a9e98;">
          Tap below to view the listing and message the buyer.
        </p>
      `,
      ctaUrl: `${APP_URL}/dashboard/product/${productId}`,
      ctaText: "View Listing & Message Buyer →",
      unsubscribeUserId: sellerId,
    });

    try {
      await getTransporter(EMAIL_PASS.value()).sendMail({
        from: FROM_ADDRESS,
        to: email,
        subject: `${buyerName} reserved your listing! 🎉`,
        html,
      });
      await markEmailSent(sellerId);
      console.log(`[Reserve email] sent to ${email}`);
    } catch (err) {
      console.error("[Reserve email] failed:", err);
    }
  }
);

// ─── Email #3: Weekly Digest (Re-engagement) ──────────────────────────────────

export const sendWeeklyDigest = onSchedule(
  { schedule: "every sunday 10:00", timeZone: "Asia/Kolkata", secrets: [EMAIL_PASS] },
  async () => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Get users who haven't been online in 7+ days and have email
    const usersSnap = await db.collection("users")
      .where("emailOptOut", "!=", true)
      .limit(500)
      .get();

    const transporter = getTransporter(EMAIL_PASS.value());
    let sent = 0;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      if (!user.email || !user.name) continue;
      if (user.online === true) continue;
      if (user.emailOptOut === true) continue;

      const lastSeen = user.lastSeen?.toMillis?.() ?? 0;
      if (now - lastSeen < sevenDaysMs) continue; // Still active — skip

      const lastEmail = user.lastEmailNotification?.toMillis?.() ?? 0;
      if (now - lastEmail < DAILY_LIMIT_MS) continue; // Already emailed recently

      // Fetch 3 new products from their school/city
      let products: any[] = [];
      try {
        const pSnap = await db.collection("products")
          .where("status", "==", "available")
          .orderBy("createdAt", "desc")
          .limit(4)
          .get();
        products = pSnap.docs
          .filter((d) => d.data().sellerId !== userDoc.id)
          .slice(0, 3)
          .map((d) => ({ id: d.id, ...d.data() }));
      } catch {}

      if (products.length === 0) continue; // Nothing to show

      const firstName = user.name.split(" ")[0];
      const productCardsHtml = products.map((p: any) => `
        <a href="${APP_URL}/dashboard/product/${p.id}" style="display:block;text-decoration:none;background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #eaeeec;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a1a;">${p.title}</p>
          <p style="margin:0;font-size:14px;color:#1a6b5e;font-weight:600;">₹${p.price} &nbsp;·&nbsp; <span style="font-weight:400;color:#6b7c79;">${p.category}</span></p>
        </a>
      `).join("");

      const html = buildEmailHtml({
        preheader: `New listings from your campus – check out what's available!`,
        headerBadge: "📦 Weekly Digest",
        greeting: `Miss us, ${firstName}? 👀`,
        bodyHtml: `
          <p style="margin:0 0 24px;font-size:16px;color:#374140;line-height:1.7;">
            While you were away, students near you listed some fresh items on the marketplace. Here's a quick peek:
          </p>
          ${productCardsHtml}
          <p style="margin:16px 0 0;font-size:14px;color:#8a9e98;">
            Plus posts, clubs, and more are waiting for you on Nextbench.
          </p>
        `,
        ctaUrl: `${APP_URL}/dashboard`,
        ctaText: "Explore Nextbench →",
        unsubscribeUserId: userDoc.id,
      });

      try {
        await transporter.sendMail({
          from: FROM_ADDRESS,
          to: user.email,
          subject: `What's new on Nextbench this week 🛍️`,
          html,
        });
        await db.collection("users").doc(userDoc.id).update({
          lastEmailNotification: admin.firestore.FieldValue.serverTimestamp(),
        });
        sent++;
        // Rate limit: don't hammer Resend
        await new Promise((r) => setTimeout(r, 150));
      } catch (err) {
        console.error(`[Digest] failed for ${user.email}:`, err);
      }
    }

    console.log(`[Weekly Digest] Sent to ${sent} users.`);
    await db.collection("emailBroadcasts").add({
      type: "weekly_digest",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      recipientCount: sent,
    });
  }
);

// ─── Email #4: Admin Broadcast ─────────────────────────────────────────────────

export const broadcastEmail = onCall(
  { secrets: [EMAIL_PASS], invoker: "public", cors: CORS_ORIGINS, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Must be logged in.");

    if (request.auth?.token?.admin !== true) {
      throw new HttpsError("permission-denied", "Admins only.");
    }

    const { subject, bodyHtml, broadcastId } = request.data as {
      subject: string;
      bodyHtml: string;
      broadcastId: string;
    };

    if (!subject || !bodyHtml) throw new HttpsError("invalid-argument", "subject and bodyHtml are required.");
    if (subject.length > 200) throw new HttpsError("invalid-argument", "Subject too long.");

    if (!broadcastId || typeof broadcastId !== "string") {
      throw new HttpsError("invalid-argument", "broadcastId is required.");
    }

    // Idempotency: atomically CLAIM the broadcast BEFORE sending. create() fails
    // if the doc already exists, so a timeout, crash, or client retry can never
    // re-send to everyone who already received it. (Previously the guard doc was
    // written only after the whole send loop, so any early exit re-spammed users.)
    const broadcastRef = db.collection("emailBroadcasts").doc(broadcastId);
    try {
      await broadcastRef.create({
        subject,
        sentBy: uid,
        status: "in_progress",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err: any) {
      // GRPC ALREADY_EXISTS === 6
      if (err?.code === 6 || err?.code === "already-exists") {
        throw new HttpsError("already-exists", "This broadcast was already sent.");
      }
      throw err;
    }

    const usersSnap = await db.collection("users").limit(2000).get();
    const transporter = getTransporter(EMAIL_PASS.value());

    let sent = 0;
    let failed = 0;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      if (!user.email || user.emailOptOut === true) continue;

      const firstName = user.name?.split(" ")[0] || "there";
      const unsubscribeUrl = `${APP_URL}/unsubscribe?uid=${userDoc.id}`;

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f0f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4f3;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
  <tr><td align="center" style="padding-bottom:24px;">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr><td style="background:#1a6b5e;border-radius:12px;padding:12px 24px;"><span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.08em;">NEXTBENCH</span></td></tr>
    </table>
  </td></tr>
  <tr>
    <td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="background:linear-gradient(135deg,#1a6b5e 0%,#2d9e8a 100%);padding:32px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Hey ${firstName} 👋</h1>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          ${bodyHtml}
          <hr style="border:none;border-top:1px solid #eaeeec;margin:32px 0;"/>
          <p style="margin:0;font-size:12px;color:#8a9e98;">
            You're receiving this announcement because you have a Nextbench account.<br/>
            <a href="${unsubscribeUrl}" style="color:#8a9e98;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</td></tr></table>
</body></html>`;

      try {
        await transporter.sendMail({ from: FROM_ADDRESS, to: user.email, subject, html: fullHtml });
        sent++;
        await new Promise((r) => setTimeout(r, 100)); // ~10 emails/sec
      } catch (err: any) {
        console.error(`Failed to send broadcast email to ${user.email}:`, err);
        failed++;
      }
    }

    await broadcastRef.update({
      status: "completed",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      recipientCount: sent,
      failedCount: failed,
    });

    return { success: true, sent, failed };
  }
);

// ─── Unsubscribe Endpoint ─────────────────────────────────────────────────────

export const unsubscribeFromEmails = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const { uid } = request.data as { uid: string };
  if (!uid) throw new HttpsError("invalid-argument", "uid required.");
  await db.collection("users").doc(uid).update({ emailOptOut: true });
  return { success: true };
});

// ─── Content Moderation Triggers ──────────────────────────────────────────────

const BANNED_KEYWORDS = [
  "porn", "nsfw", "sex", "nude", "hentai", "fuck", "shit", "bitch",
  "asshole", "cunt", "dick", "pussy", "bastard", "slut", "whore", "moderatorbypass"
];

function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  const homoglyphs: Record<string, string> = {
    "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "|": "i",
    "0": "o", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b",
    "vv": "w", "uu": "w", "9": "g", "6": "g"
  };
  normalized = normalized.split("").map(char => homoglyphs[char] || char).join("");
  return normalized.replace(/[^a-z]/g, "");
}

function isTextSafeFallback(text: string): boolean {
  if (!text) return true;
  const clean = normalizeText(text);
  for (const word of BANNED_KEYWORDS) {
    if (clean.includes(word)) return false;
  }
  return true;
}

async function moderateTextContent(text: string): Promise<{ isSafe: boolean; reason?: string }> {
  // Use natural language API key or fallback to gemini api key if available
  const apiKey = process.env.NATURAL_LANGUAGE_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_FIREBASE_API_KEY;

  if (apiKey) {
    try {
      const url = `https://language.googleapis.com/v1/documents:moderateText?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: {
            type: 'PLAIN_TEXT',
            content: text,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const categories = data.moderationCategories || [];
        const flaggedCategories = ['Toxic', 'Insult', 'Profanity', 'Sexual', 'Violent', 'Harassment', 'Hate Speech'];
        for (const cat of categories) {
          if (flaggedCategories.some(fc => cat.name.includes(fc)) && cat.confidence > 0.65) {
            return {
              isSafe: false,
              reason: `Flagged by AI: ${cat.name} (${Math.round(cat.confidence * 100)}%)`,
            };
          }
        }
      }
    } catch (err) {
      console.error('Error calling Natural Language API:', err);
    }
  }

  // Fallback keyword-based check
  if (!isTextSafeFallback(text)) {
    return { isSafe: false, reason: 'Flagged by content blacklist.' };
  }

  return { isSafe: true };
}

export const moderatePost = onDocumentCreated(
  { document: "posts/{postId}" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    // Skip if already pending/moderated (prevent loop)
    if (data.status === 'pending' && data.moderationFlagged) return;

    const title = data.title || "";
    const content = data.content || "";
    const fullText = `${title} ${content}`;

    const moderation = await moderateTextContent(fullText);
    if (!moderation.isSafe) {
      console.log(`Post ${event.params.postId} flagged: ${moderation.reason}. Marking as pending.`);
      await snapshot.ref.update({
        status: 'pending',
        moderationFlagged: true,
        moderationReason: moderation.reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
);

export const moderateReply = onDocumentCreated(
  { document: "post_replies/{replyId}" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    // Skip if already flagged/moderated (prevent loop)
    if (data.moderationFlagged) return;

    const content = data.content || "";

    const moderation = await moderateTextContent(content);
    if (!moderation.isSafe) {
      console.log(`Reply ${event.params.replyId} flagged: ${moderation.reason}. Redacting content.`);
      await snapshot.ref.update({
        content: '[This comment was flagged for containing sensitive words.]',
        moderationFlagged: true,
        moderationReason: moderation.reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
);

export const onUserUpdated = onDocumentUpdated(
  { document: "users/{userId}" },
  async (event) => {
    const change = event.data;
    if (!change) return;

    const before = change.before.data();
    const after = change.after.data();
    const uid = event.params.userId;

    const beforeAdmin = before?.isAdmin === true;
    const afterAdmin = after?.isAdmin === true;

    // If admin status changed, sync to custom claims
    if (beforeAdmin !== afterAdmin) {
      console.log(`Syncing admin custom claim for user ${uid} to ${afterAdmin}`);
      await admin.auth().setCustomUserClaims(uid, { admin: afterAdmin });
    }
  }
);

async function enforceRateLimit(uid: string, actionType: string, limit: number, windowMs: number): Promise<boolean> {
  const rateLimitRef = db.collection('rate_limits').doc(`${actionType}_${uid}`);
  const now = Date.now();
  const windowStartThreshold = now - windowMs;

  try {
    let allowed = true;
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      if (!doc.exists) {
        transaction.set(rateLimitRef, { count: 1, windowStart: now });
      } else {
        const data = doc.data();
        if (!data || data.windowStart < windowStartThreshold) {
          transaction.update(rateLimitRef, { count: 1, windowStart: now });
        } else {
          if (data.count >= limit) {
            allowed = false;
          } else {
            transaction.update(rateLimitRef, { count: data.count + 1 });
          }
        }
  }
});

    return allowed;
  } catch (err) {
    console.error(`Rate limit check failed for ${uid} (${actionType}):`, err);
    return true; // Fail-open on rate limiter error to prevent blocking normal users
  }
}

async function friendSetFor(uid: string): Promise<Set<string>> {
  const [followingSnap, followerSnap] = await Promise.all([
    db.collection("follows").where("followerId", "==", uid).get(),
    db.collection("follows").where("followingId", "==", uid).get(),
  ]);
  const following = new Set<string>();
  const followers = new Set<string>();
  followingSnap.forEach((d) => {
    const id = d.get("followingId");
    if (typeof id === "string") following.add(id);
  });
  followerSnap.forEach((d) => {
    const id = d.get("followerId");
    if (typeof id === "string") followers.add(id);
  });
  return new Set([...following].filter((id) => followers.has(id)));
}

function isVisiblePostData(data: admin.firestore.DocumentData, uid: string | null, blockedIds: Set<string>, friendIds: Set<string>): boolean {
  const authorId = typeof data.authorId === "string" ? data.authorId : "";
  if (!authorId || blockedIds.has(authorId)) return false;
  if (data.status !== "approved" && data.authorId !== uid) return false;
  if (data.privacy === "private" && data.authorId !== uid && (!uid || !friendIds.has(authorId))) return false;
  return true;
}

async function enrichPosts(docs: admin.firestore.QueryDocumentSnapshot[]): Promise<SerializedDoc[]> {
  const authorIds = Array.from(new Set(docs.map((d) => d.get("authorId")).filter((id): id is string => typeof id === "string")));
  const authorDocs = authorIds.length > 0
    ? await db.getAll(...authorIds.map((id) => db.collection("users").doc(id)))
    : [];
  const authorMap = new Map(authorDocs.map((d) => [d.id, d.data() || {}]));

  return docs.map((docSnap) => {
    const raw = docSnap.data();
    const post = serializeDoc(docSnap);
    const isAnonymous = raw.isAnonymous === true;
    const author = isAnonymous ? {} : (authorMap.get(raw.authorId) || {});
    return {
      ...post,
      authorName: isAnonymous
        ? (raw.authorName || raw.personaName || "Anonymous")
        : (author.name || raw.authorName || "Unknown User"),
      authorProfilePicture: isAnonymous ? null : (author.profilePicture || raw.authorProfilePicture || null),
      school: author.school || raw.school || "Unknown School",
    };
  });
}

async function enrichProducts(docs: admin.firestore.QueryDocumentSnapshot[]): Promise<SerializedDoc[]> {
  const sellerIds = Array.from(new Set(docs.map((d) => d.get("sellerId")).filter((id): id is string => typeof id === "string")));
  const sellerDocs = sellerIds.length > 0
    ? await db.getAll(...sellerIds.map((id) => db.collection("users").doc(id)))
    : [];
  const sellerMap = new Map(sellerDocs.map((d) => [d.id, d.data() || {}]));

  return docs.map((docSnap) => {
    const raw = docSnap.data();
    const seller = sellerMap.get(raw.sellerId) || {};
    return {
      ...serializeDoc(docSnap),
      sellerName: seller.name || raw.sellerName || "Unknown User",
      sellerSchool: seller.school || raw.sellerSchool || "Unknown School",
      sellerProfilePicture: seller.profilePicture || raw.sellerProfilePicture || null,
    };
  });
}

export const getPublicUsers = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = assertAuthedUid(request);
  const requestedIds = Array.isArray(request.data?.userIds)
    ? request.data.userIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0).slice(0, 50)
    : [];
  if (requestedIds.length === 0) return { users: [] };

  const blockedIds = await blockSetFor(uid);
  const uniqueIds: string[] = Array.from(new Set<string>(requestedIds));
  const docs = await db.getAll(...uniqueIds.map((id) => db.collection("users").doc(id)));
  const users = docs
    .filter((d) => d.id === uid || !blockedIds.has(d.id))
    .map(publicUserFromDoc)
    .filter((u): u is PublicUser => u !== null);
  return { users };
});

export const getBlockedUsers = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = assertAuthedUid(request);
  const blockSnap = await db.collection("blocks")
    .where("blockerId", "==", uid)
    .limit(100)
    .get();

  if (blockSnap.empty) return { users: [] };

  const blockedIds = blockSnap.docs
    .map((docSnap) => docSnap.get("blockedId"))
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const userDocs = await db.getAll(...blockedIds.map((id) => db.collection("users").doc(id)));
  const userMap = new Map(userDocs.map((docSnap) => [docSnap.id, publicUserFromDoc(docSnap)]));
  const users = blockSnap.docs.map((blockDocSnap) => {
    const blockedId = blockDocSnap.get("blockedId");
    const user = typeof blockedId === "string" ? userMap.get(blockedId) : null;
    return {
      ...(user || { name: "Deleted user" }),
      blockDocId: blockDocSnap.id,
      id: typeof blockedId === "string" ? blockedId : blockDocSnap.id,
    };
  });

  return { users };
});

export const getPublicProfile = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = assertAuthedUid(request);
  const userId = typeof request.data?.userId === "string" ? request.data.userId : "";
  if (!userId) throw new HttpsError("invalid-argument", "Missing userId.");
  if (uid !== userId && await hasBlockRelationship(uid, userId)) return { user: null };
  const userDoc = await db.collection("users").doc(userId).get();
  return { user: publicUserFromDoc(userDoc) };
});

export const getPublicProfileContent = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = assertAuthedUid(request);
  const userId = typeof request.data?.userId === "string" ? request.data.userId : "";
  if (!userId) throw new HttpsError("invalid-argument", "Missing userId.");
  if (uid !== userId && await hasBlockRelationship(uid, userId)) {
    return { user: null, posts: [], products: [] };
  }

  const [userDoc, blockedIds, friendIds, productSnap, postSnap] = await Promise.all([
    db.collection("users").doc(userId).get(),
    blockSetFor(uid),
    friendSetFor(uid),
    db.collection("products").where("sellerId", "==", userId).limit(120).get(),
    db.collection("posts").where("authorId", "==", userId).limit(120).get(),
  ]);

  if (!userDoc.exists) return { user: null, posts: [], products: [] };

  const productDocs = productSnap.docs.filter((docSnap) => {
    const data = docSnap.data();
    if (uid === userId) return true;
    return !blockedIds.has(userId) && ["available", "sold"].includes(String(data.status || ""));
  });

  const postDocs = postSnap.docs.filter((docSnap) => {
    const data = docSnap.data();
    if (uid !== userId && data.isAnonymous === true) return false;
    return isVisiblePostData(data, uid, blockedIds, friendIds);
  });

  productDocs.sort((a, b) => docMillis(b, "createdAt") - docMillis(a, "createdAt"));
  postDocs.sort((a, b) => docMillis(b, "createdAt") - docMillis(a, "createdAt"));

  const [posts, products] = await Promise.all([enrichPosts(postDocs), enrichProducts(productDocs)]);
  return { user: publicUserFromDoc(userDoc), posts, products };
});

export const searchPublicUsers = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = assertAuthedUid(request);
  const term = normalizeSearchTerm(request.data?.query);
  const max = Math.min(Math.max(Number(request.data?.limit) || 20, 1), 50);
  const excludeIds = new Set(
    Array.isArray(request.data?.excludeIds)
      ? request.data.excludeIds.filter((id: unknown): id is string => typeof id === "string")
      : []
  );
  const blockedIds = await blockSetFor(uid);

  let snap: admin.firestore.QuerySnapshot;
  if (term) {
    const nameTerm = term.charAt(0).toUpperCase() + term.slice(1);
    snap = await db.collection("users")
      .where("name", ">=", nameTerm)
      .where("name", "<=", `${nameTerm}\uf8ff`)
      .limit(max * 3)
      .get();
  } else {
    snap = await db.collection("users").limit(max * 3).get();
  }

  const users: PublicUser[] = [];
  snap.forEach((docSnap) => {
    if (users.length >= max) return;
    if (docSnap.id === uid || excludeIds.has(docSnap.id) || blockedIds.has(docSnap.id)) return;
    const data = docSnap.data();
    if (term && !matchesSearch(data.name, term) && !matchesSearch(data.username, term) && !matchesSearch(data.school, term)) return;
    const user = publicUserFromDoc(docSnap);
    if (user) users.push(user);
  });
  return { users };
});

export const lookupReferralCode = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const code = typeof request.data?.code === "string" ? request.data.code.trim().toUpperCase() : "";
  if (!code || code.length > 32) throw new HttpsError("invalid-argument", "Invalid referral code.");
  const snap = await db.collection("users").where("referralCode", "==", code).limit(1).get();
  return { userId: snap.empty ? null : snap.docs[0].id };
});

export const isReferralCodeAvailable = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  assertAuthedUid(request);
  const code = typeof request.data?.code === "string" ? request.data.code.trim().toUpperCase() : "";
  if (!code || code.length > 32) throw new HttpsError("invalid-argument", "Invalid referral code.");
  const snap = await db.collection("users").where("referralCode", "==", code).limit(1).get();
  return { available: snap.empty };
});

export const getDiscoveryFeed = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = request.auth?.uid || null;
  const [blockedIds, friendIds] = uid ? await Promise.all([blockSetFor(uid), friendSetFor(uid)]) : [new Set<string>(), new Set<string>()];
  const postCursor = typeof request.data?.postCreatedAt === "number" ? request.data.postCreatedAt : null;
  const productCursor = typeof request.data?.productCreatedAt === "number" ? request.data.productCreatedAt : null;

  let postQuery = db.collection("posts")
    .where("status", "==", "approved")
    .orderBy("createdAt", "desc")
    .limit(40);
  if (postCursor) {
    postQuery = postQuery.startAfter(admin.firestore.Timestamp.fromMillis(postCursor));
  }

  let productQuery = db.collection("products")
    .where("status", "in", ["available", "sold"])
    .orderBy("createdAt", "desc")
    .limit(30);
  if (productCursor) {
    productQuery = productQuery.startAfter(admin.firestore.Timestamp.fromMillis(productCursor));
  }

  const [postSnap, productSnap] = await Promise.all([postQuery.get(), productQuery.get()]);
  const visiblePostDocs = postSnap.docs.filter((d) => isVisiblePostData(d.data(), uid, blockedIds, friendIds)).slice(0, 20);
  const visibleProductDocs = productSnap.docs
    .filter((d) => {
      const sellerId = d.get("sellerId");
      return typeof sellerId === "string" && !blockedIds.has(sellerId);
    })
    .slice(0, 10);

  const [posts, products] = await Promise.all([enrichPosts(visiblePostDocs), enrichProducts(visibleProductDocs)]);
  return {
    posts,
    products,
    hasMorePosts: postSnap.size === 40,
    hasMoreProducts: productSnap.size === 30,
    nextCursor: {
      postCreatedAt: postSnap.docs.length ? docMillis(postSnap.docs[postSnap.docs.length - 1], "createdAt") : undefined,
      productCreatedAt: productSnap.docs.length ? docMillis(productSnap.docs[productSnap.docs.length - 1], "createdAt") : undefined,
    },
  };
});

export const searchDiscovery = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = request.auth?.uid || null;
  const term = normalizeSearchTerm(request.data?.query);
  const school = typeof request.data?.school === "string" ? request.data.school.trim() : "";
  const city = typeof request.data?.city === "string" ? request.data.city.trim() : "";
  const suggestions = request.data?.suggestions === true;
  const [blockedIds, friendIds] = uid ? await Promise.all([blockSetFor(uid), friendSetFor(uid)]) : [new Set<string>(), new Set<string>()];

  let userQuery = db.collection("users").limit(suggestions ? 200 : 120);
  if (term.startsWith("@")) {
    const username = term.slice(1);
    userQuery = db.collection("users")
      .where("username", ">=", username)
      .where("username", "<=", `${username}\uf8ff`)
      .limit(40);
  } else if (school) {
    userQuery = db.collection("users").where("school", "==", school).limit(120);
  } else if (city) {
    userQuery = db.collection("users").where("city", "==", city).limit(120);
  }

  const [usersSnap, postsSnap, productsSnap] = await Promise.all([
    userQuery.get(),
    db.collection("posts").where("status", "==", "approved").orderBy("createdAt", "desc").limit(suggestions ? 20 : 80).get(),
    db.collection("products").where("status", "==", "available").orderBy("createdAt", "desc").limit(suggestions ? 20 : 80).get(),
  ]);

  const users: PublicUser[] = [];
  usersSnap.forEach((docSnap) => {
    if (docSnap.id === uid || blockedIds.has(docSnap.id)) return;
    const data = docSnap.data();
    if (data.verified !== true) return;
    if (term && !term.startsWith("@") && !matchesSearch(data.name, term) && !matchesSearch(data.username, term) && !matchesSearch(data.school, term)) return;
    const user = publicUserFromDoc(docSnap);
    if (user) users.push(user);
  });

  const postDocs = postsSnap.docs
    .filter((d) => {
      const data = d.data();
      return isVisiblePostData(data, uid, blockedIds, friendIds)
        && (!school || data.school === school)
        && (!term || matchesSearch(data.title, term) || matchesSearch(data.content, term) || matchesSearch(data.school, term));
    })
    .slice(0, suggestions ? 5 : 20);

  const productDocs = productsSnap.docs
    .filter((d) => {
      const data = d.data();
      const sellerId = typeof data.sellerId === "string" ? data.sellerId : "";
      return sellerId
        && !blockedIds.has(sellerId)
        && (!city || data.city === city)
        && (!term || matchesSearch(data.title, term) || matchesSearch(data.category, term) || matchesSearch(data.sellerName, term));
    })
    .slice(0, suggestions ? 5 : 20);

  const [posts, products] = await Promise.all([enrichPosts(postDocs), enrichProducts(productDocs)]);
  return { users: users.slice(0, suggestions ? 15 : 50), posts, products };
});

export const getPostReplies = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = assertAuthedUid(request);
  const postId = typeof request.data?.postId === "string" ? request.data.postId : "";
  if (!postId) throw new HttpsError("invalid-argument", "Missing postId.");

  const [blockedIds, friendIds, postDoc] = await Promise.all([
    blockSetFor(uid),
    friendSetFor(uid),
    db.collection("posts").doc(postId).get(),
  ]);
  if (!postDoc.exists || !isVisiblePostData(postDoc.data() || {}, uid, blockedIds, friendIds)) {
    throw new HttpsError("permission-denied", "Post is not available.");
  }

  const snap = await db.collection("post_replies").where("postId", "==", postId).get();
  const replyDocs = snap.docs.filter((d) => {
    const authorId = d.get("authorId");
    return typeof authorId !== "string" || !blockedIds.has(authorId);
  });
  replyDocs.sort((a, b) => docMillis(a, "createdAt") - docMillis(b, "createdAt"));

  const authorIds = Array.from(new Set(replyDocs.map((d) => d.get("authorId")).filter((id): id is string => typeof id === "string")));
  const authorDocs = authorIds.length > 0
    ? await db.getAll(...authorIds.map((id) => db.collection("users").doc(id)))
    : [];
  const avatarMap = new Map(authorDocs.map((d) => [d.id, d.get("profilePicture") || null]));

  const replies = replyDocs.map((docSnap) => ({
    ...serializeDoc(docSnap),
    authorProfilePicture: docSnap.get("authorProfilePicture") || avatarMap.get(docSnap.get("authorId")) || null,
  }));
  return { replies };
});

export const getProductReviews = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = assertAuthedUid(request);
  const productId = typeof request.data?.productId === "string" ? request.data.productId : "";
  if (!productId) throw new HttpsError("invalid-argument", "Missing productId.");

  const productDoc = await db.collection("products").doc(productId).get();
  if (!productDoc.exists) return { reviews: [] };

  const sellerId = productDoc.get("sellerId");
  if (typeof sellerId !== "string" || (uid !== sellerId && await hasBlockRelationship(uid, sellerId))) {
    return { reviews: [] };
  }

  const blockedIds = await blockSetFor(uid);
  const reviewsSnap = await db.collection("reviews").where("productId", "==", productId).limit(100).get();
  const reviews = reviewsSnap.docs
    .filter((docSnap) => {
      const reviewerId = docSnap.get("reviewerId");
      return typeof reviewerId !== "string" || reviewerId === uid || !blockedIds.has(reviewerId);
    })
    .sort((a, b) => docMillis(b, "createdAt") - docMillis(a, "createdAt"))
    .map(serializeDoc);

  return { reviews };
});

export const getLandingStats = onCall({ invoker: "public", cors: CORS_ORIGINS }, async () => {
  const [usersSnap, productsSnap, schoolsSnap] = await Promise.all([
    db.collection("users").limit(1000).get(),
    db.collection("products").limit(1000).get(),
    db.collection("schools").limit(1000).get(),
  ]);
  return {
    totalUsers: usersSnap.size,
    totalProducts: productsSnap.size,
    totalSchools: schoolsSnap.size,
  };
});

export const deletePostCascade = onCall({ invoker: "public", cors: CORS_ORIGINS, timeoutSeconds: 120 }, async (request) => {
  const uid = assertAuthedUid(request);
  const postId = typeof request.data?.postId === "string" ? request.data.postId : "";
  if (!postId) throw new HttpsError("invalid-argument", "Missing postId.");

  const postRef = db.collection("posts").doc(postId);
  const postDoc = await postRef.get();
  if (!postDoc.exists) return { success: true, deleted: { replies: 0, upvotes: 0, downvotes: 0, reactions: 0, saves: 0 } };

  const authorId = postDoc.get("authorId");
  if (authorId !== uid && request.auth?.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Only the post author or an admin can delete this post.");
  }

  const [replies, upvotes, downvotes, reactions, saves] = await Promise.all([
    deleteQueryDocs(db.collection("post_replies").where("postId", "==", postId)),
    deleteQueryDocs(db.collection("post_upvotes").where("postId", "==", postId)),
    deleteQueryDocs(db.collection("post_downvotes").where("postId", "==", postId)),
    deleteQueryDocs(db.collection("post_reactions").where("postId", "==", postId)),
    deleteQueryDocs(db.collection("saved_posts").where("postId", "==", postId)),
  ]);

  await postRef.delete();
  return { success: true, deleted: { replies, upvotes, downvotes, reactions, saves } };
});

export const rateLimitPost = onDocumentCreated(
  { document: "posts/{postId}" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const uid = data.authorId;
    if (!uid) return;

    // Admin users bypass rate limiting
    const callerSnap = await db.collection("users").doc(uid).get();
    if (callerSnap.data()?.isAdmin === true) return;

    // Limit: Max 5 posts per 5 minutes
    const allowed = await enforceRateLimit(uid, 'post', 5, 300000);
    if (!allowed) {
      console.warn(`User ${uid} exceeded post rate limit. Deleting post ${event.params.postId}.`);
      await snapshot.ref.delete();
    }
  }
);

export const rateLimitMessage = onDocumentCreated(
  { document: "chatRooms/{roomId}/messages/{messageId}" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const uid = data.senderId;
    if (!uid) return;

    // Admin users bypass rate limiting
    const callerSnap = await db.collection("users").doc(uid).get();
    if (callerSnap.data()?.isAdmin === true) return;

    // Limit: Max 30 messages per minute
    const allowed = await enforceRateLimit(uid, 'message', 30, 60000);
    if (!allowed) {
      console.warn(`User ${uid} exceeded message rate limit. Deleting message ${event.params.messageId}.`);
      await snapshot.ref.delete();
    }
  }
);

export const rateLimitReply = onDocumentCreated(
  { document: "post_replies/{replyId}" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const uid = data.authorId;
    if (!uid) return;

    // Admin users bypass rate limiting
    const callerSnap = await db.collection("users").doc(uid).get();
    if (callerSnap.data()?.isAdmin === true) return;

    // Limit: Max 15 replies per minute
    const allowed = await enforceRateLimit(uid, 'reply', 15, 60000);
    if (!allowed) {
      console.warn(`User ${uid} exceeded reply rate limit. Deleting reply ${event.params.replyId}.`);
      await snapshot.ref.delete();
    }
  }
);

export const createNotification = onCall({ invoker: "public", cors: CORS_ORIGINS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be logged in.");
  const isAdminCaller = request.auth?.token?.admin === true;

  const { userId, type, title, message, link, postId } = request.data as {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    postId?: string;
  };

  if (!userId || !type || !title || !message) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  // Rate Limiting (max 15 notification creations/minute per user)
  const allowed = await enforceRateLimit(uid, 'notif_create', 15, 60000);
  if (!allowed) {
    throw new HttpsError("resource-exhausted", "Rate limit exceeded. Max 15 notifications per minute.");
  }

  // Restrict administrative/sensitive notification types to actual admin users
  const adminNotifTypes = ['listing_approved', 'listing_rejected', 'admin_promoted', 'user_approved'];
  if (adminNotifTypes.includes(type)) {
    if (!isAdminCaller) {
      throw new HttpsError("permission-denied", "Only admins can trigger administrative notifications.");
    }
  }

  if (!isAdminCaller && uid !== userId && await hasBlockRelationship(uid, userId)) {
    throw new HttpsError("permission-denied", "Cannot notify this user.");
  }

  // Check that the recipient user document exists
  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "Recipient user not found.");
  }

  // Add the notification document
  const notifRef = await db.collection("notifications").add({
    userId,
    type,
    title,
    message,
    link: link || null,
    postId: postId || null,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, id: notifRef.id };
});

// ─────────────────────────────────────────────────────────────
// Stories foundation: mirror `follows` (auto-ID docs) into deterministic
// `follow_edges/{followerId}_{followingId}` docs so Firestore security rules can
// exists()-check a follow relationship (used by the followers/closeFriends story tiers).
// This is the single writer of follow_edges; clients may only read them.
// ─────────────────────────────────────────────────────────────

function followEdgeId(followerId: string, followingId: string): string {
  return `${followerId}_${followingId}`;
}

export const mirrorFollowEdgeOnCreate = onDocumentCreated(
  { document: "follows/{followId}" },
  async (event) => {
    const data = event.data?.data();
    const followerId = data?.followerId;
    const followingId = data?.followingId;
    if (!followerId || !followingId) return;

    const edgeRef = db.collection("follow_edges").doc(followEdgeId(followerId, followingId));
    await edgeRef.set({
      followerId,
      followingId,
      createdAt: data.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);

export const mirrorFollowEdgeOnDelete = onDocumentDeleted(
  { document: "follows/{followId}" },
  async (event) => {
    const data = event.data?.data();
    const followerId = data?.followerId;
    const followingId = data?.followingId;
    if (!followerId || !followingId) return;

    // Only remove the edge if no other follow doc still represents this pair
    // (defends against duplicate follow docs).
    const remaining = await db
      .collection("follows")
      .where("followerId", "==", followerId)
      .where("followingId", "==", followingId)
      .limit(1)
      .get();
    if (!remaining.empty) return;

    await db.collection("follow_edges").doc(followEdgeId(followerId, followingId)).delete();
  }
);

// ─────────────────────────────────────────────────────────────
// Stories: notify followers when a user posts their FIRST story after being inactive
// (no story in the prior 3 days, or ever). The inactivity gap is the anti-spam guard —
// stories posted in a burst won't re-notify. In-app notifications only; blocked skipped.
// ─────────────────────────────────────────────────────────────

const STORY_INACTIVITY_GAP_MS = 3 * 24 * 60 * 60 * 1000;

export const notifyOnFirstStory = onDocumentCreated(
  { document: "stories/{storyId}" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const story = snap.data();
    const authorId: string | undefined = story?.authorId;
    const createdAt: FirebaseFirestore.Timestamp | undefined = story?.createdAt;
    if (!authorId || !createdAt) return;

    // Find the author's previous story (most recent before this one).
    const prev = await db
      .collection("stories")
      .where("authorId", "==", authorId)
      .where("createdAt", "<", createdAt)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!prev.empty) {
      const prevCreatedAt = prev.docs[0].data().createdAt as FirebaseFirestore.Timestamp | undefined;
      const gap = createdAt.toMillis() - (prevCreatedAt?.toMillis() ?? 0);
      if (gap < STORY_INACTIVITY_GAP_MS) return; // recently active → don't notify
    }

    const authorSnap = await db.collection("users").doc(authorId).get();
    const authorName = authorSnap.data()?.name || authorSnap.data()?.username || "Someone";

    const followsSnap = await db.collection("follows").where("followingId", "==", authorId).get();
    const followerIds = Array.from(
      new Set(followsSnap.docs.map((d) => d.data().followerId as string).filter(Boolean)),
    );
    if (followerIds.length === 0) return;

    let batch = db.batch();
    let inBatch = 0;
    let notified = 0;
    for (const followerId of followerIds) {
      if (followerId === authorId) continue;
      if (await hasBlockRelationship(authorId, followerId)) continue;
      const ref = db.collection("notifications").doc();
      batch.set(ref, {
        userId: followerId,
        type: "story_posted",
        title: "New story",
        message: `${authorName} just posted a story.`,
        link: "/community",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      inBatch++;
      notified++;
      if (inBatch >= 450) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
    if (inBatch > 0) await batch.commit();
    console.log(`[story notif] ${authorId} first-after-gap → notified ${notified} followers`);
  },
);
