import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";

admin.initializeApp();
const db = admin.firestore();

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

// ─── Cloud Function: sendEmailOTP ─────────────────────────────────────────────
export const sendEmailOTP = onCall(
  { secrets: [EMAIL_USER, EMAIL_PASS, OTP_HMAC_SECRET], invoker: "public" },
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

// ─── Cloud Function: verifyEmailOTP ──────────────────────────────────────────
export const verifyEmailOTP = onCall(
  { secrets: [OTP_HMAC_SECRET], invoker: "public" },
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
    let customToken: string;
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

    // Create custom token for client-side signInWithCustomToken
    customToken = await admin.auth().createCustomToken(uid);
    return { customToken, isNewUser };
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

// ─── Existing: applyReferral ──────────────────────────────────────────────────
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
