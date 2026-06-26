"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsubscribeFromEmails = exports.broadcastEmail = exports.sendWeeklyDigest = exports.notifyOnProductReserved = exports.notifyOnNewMessage = exports.submitInviteCode = exports.createInviteCode = exports.verifyAuthOtpEmail = exports.sendAuthOtpEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
admin.initializeApp();
const db = admin.firestore();
// ─── Secrets (set via: firebase functions:secrets:set SECRET_NAME) ───────────
const EMAIL_USER = (0, params_1.defineSecret)("EMAIL_USER");
const EMAIL_PASS = (0, params_1.defineSecret)("EMAIL_PASS");
const OTP_HMAC_SECRET = (0, params_1.defineSecret)("OTP_HMAC_SECRET");
// ─── Disposable / Temp-mail domain blocklist ─────────────────────────────────
const TEMP_MAIL_DOMAINS = new Set([
    // Major disposable providers
    "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
    "guerrillamail.biz", "guerrillamail.de", "guerrillamail.info",
    "10minutemail.com", "10minutemail.net", "10minutemail.org", "10minutemail.de",
    "10minutemail.co.uk", "10minutemail.co.za", "10minutemail.pl", "10minutemail.ru",
    "yopmail.com", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc",
    "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf",
    "monemail.fr.nf", "monmail.fr.nf", "dispostable.com", "fakeinbox.com",
    "trashmail.com", "trashmail.net", "trashmail.org", "trashmail.at", "trashmail.io",
    "trashmail.me", "trashmail.xyz", "throwam.com", "throwam.net",
    "sharklasers.com", "guerrillamailblock.com", "grr.la", "guerrillamail.info",
    "spam4.me", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
    "mailnull.com", "maildrop.cc", "mailnesia.com", "mailnull.com",
    "mohmal.com", "mohmal.im", "tempr.email", "discard.email",
    "mintemail.com", "getnada.com", "nada.email", "nada.ltd",
    "jetable.fr", "jetable.net", "jetable.org", "jetable.pp.ua",
    "anonaddy.com", "anonaddy.me", "anonaddy.io",
    "spamfree24.org", "spamfree24.de", "spamfree24.eu", "spamfree24.info",
    "spamfree24.biz", "spamfree24.com", "spamfree.eu",
    "deadaddress.com", "deadletter.ga", "deathmail.net",
    "mytrashmail.com", "meltmail.com", "filzmail.com",
    "tempinbox.com", "tempinbox.co.uk", "tempmail.com", "tempmail.net",
    "tempomail.fr", "temporaryemail.com", "temporaryforwarding.com",
    "trash2009.com", "trash2010.com", "trash2011.com",
    "trash-mail.at", "trash-mail.com", "trash-mail.de", "trash-mail.io",
    "crazymailing.com", "dontreg.com", "dontsendmeemail.com",
    "easytrashmail.com", "emailwarden.com", "etranquil.com", "etranquil.net",
    "etranquil.org", "fastacura.com", "fastchevy.com", "fastchrysler.com",
    "fastkawasaki.com", "fastmazda.com", "fastmitsubishi.com", "fastnissan.com",
    "fastsubaru.com", "fastsuzuki.com", "fasttoyota.com", "fastyamaha.com",
    "filbert8.com", "fivemail.de", "fleckens.hu", "freemail.ms",
    "fux0ringduh.com", "get1mail.com", "get2mail.fr", "getonemail.com",
    "getonemail.net", "ghosttexter.de", "givmail.com", "haltospam.com",
    "herp.in", "hidebox.org", "hidemail.de", "hidemail.pro", "hochsitze.com",
    "hotpop.com", "hulapla.de", "ieatspam.eu", "ieatspam.info", "imails.info",
    "inoutmail.de", "inoutmail.eu", "inoutmail.info", "inoutmail.net",
    "insorg.org", "instant-email.org", "ipoo.org", "irish2me.com",
    "iwi.net", "jetable.com", "jnxjn.com", "joker.com", "jsrsolutions.com",
    "kasmail.com", "kaspop.com", "killmail.com", "killmail.net",
    "kir.ch.tc", "klassmaster.com", "klassmaster.net", "klzlk.com",
    "koszmail.pl", "kulturbetrieb.info", "kurzepost.de", "letthemeatspam.com",
    "lhsdv.com", "libox.fr", "lifebyfood.com", "link2mail.net",
    "litedrop.com", "lol.ovpn.to", "lookugly.com", "lopl.co.cc",
    "lortemail.dk", "lovemeleaveme.com", "lr7.us", "lr78.com",
    "lukop.dk", "m21.cc", "mail-filter.com", "mail-temporaire.fr",
    "mail.by", "mail4trash.com", "mailbidon.com", "mailbiz.biz",
    "mailblocks.com", "mailbucket.org", "mailcat.biz", "mailcatch.com",
    "maildrop.ga", "maildu.de", "maileater.com", "mailexpire.com",
    "mailfa.tk", "mailforspam.com", "mailfreeonline.com", "mailguard.me",
    "mailimate.com", "mailme.ir", "mailme.lv", "mailme24.com",
    "mailmetrash.com", "mailmoat.com", "mailms.com", "mailnew.com",
    "mailnull.com", "mailorg.org", "mailpick.biz", "mailproxsy.com",
    "mailquack.com", "mailrock.biz", "mailscrap.com", "mailshell.com",
    "mailsiphon.com", "mailslapping.com", "mailslife.com", "mailspeed.de",
    "mailtemporar.ro", "mailtemporaire.com", "mailtemporaire.fr",
    "mailtome.de", "mailtothis.com", "mailttruck.com", "mailzilla.com",
    "mailzilla.org", "mbx.cc", "mega.zik.dj", "meinspamschutz.de",
    "meltmail.com", "messagebeamer.de", "mfsa.ru", "mierdamail.com",
    "migumail.com", "mindless.com", "mjukglass.nu", "moncourrier.fr.nf",
    "monemail.fr.nf", "monmail.fr.nf", "moy.so", "mt2009.com",
    "mt2014.com", "mx0.wwwnew.eu", "my10minutemail.com", "mypartyclip.de",
    "myphantomemail.com", "mysamp.de", "myspaceinc.com", "myspaceinc.net",
    "myspaceinc.org", "myspacepimpedup.com", "myspamless.com",
    "mytemp.email", "mytrashmail.com",
    // Common typosquatting patterns
    "gmailnot.com", "yahooo.com", "outloook.com",
]);
function isTempMail(email) {
    var _a;
    const domain = (_a = email.split("@")[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (!domain)
        return true;
    return TEMP_MAIL_DOMAINS.has(domain);
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
// ─── Hashing Utilities ────────────────────────────────────────────────────────
function hashWithSecret(value, secret) {
    return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
function hashEmail(email, secret) {
    return hashWithSecret(email.toLowerCase().trim(), secret);
}
function hashOtp(otp, secret) {
    return hashWithSecret(otp, secret);
}
// ─── OTP Generation ───────────────────────────────────────────────────────────
function generateOtp() {
    // crypto.randomInt is cryptographically secure
    return String(crypto.randomInt(100000, 999999));
}
// ─── Email Sending ────────────────────────────────────────────────────────────
async function sendOtpEmail(to, otp, emailUser, emailPass) {
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
exports.sendAuthOtpEmail = (0, https_1.onCall)({ secrets: [EMAIL_USER, EMAIL_PASS, OTP_HMAC_SECRET], invoker: "public", cors: true }, async (request) => {
    var _a;
    const rawEmail = (((_a = request.data) === null || _a === void 0 ? void 0 : _a.email) || "").toString().trim().toLowerCase();
    // 1. Validate email
    if (!isValidEmail(rawEmail)) {
        throw new https_1.HttpsError("invalid-argument", "Please enter a valid email address.");
    }
    // 2. Block temp / disposable emails
    if (isTempMail(rawEmail)) {
        throw new https_1.HttpsError("invalid-argument", "Disposable or temporary email addresses are not allowed. Please use your real email.");
    }
    const secret = OTP_HMAC_SECRET.value();
    const emailHash = hashEmail(rawEmail, secret);
    // 3. Rate limit: max 3 sends per 60-minute window
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const limitRef = db.collection("emailOtpRateLimits").doc(emailHash);
    await db.runTransaction(async (tx) => {
        var _a, _b, _c;
        const limitDoc = await tx.get(limitRef);
        if (limitDoc.exists) {
            const data = limitDoc.data();
            const windowStart = (_b = (_a = data.windowStart) === null || _a === void 0 ? void 0 : _a.toMillis()) !== null && _b !== void 0 ? _b : 0;
            const count = (_c = data.count) !== null && _c !== void 0 ? _c : 0;
            if (now - windowStart < windowMs) {
                if (count >= 3) {
                    throw new https_1.HttpsError("resource-exhausted", "Too many OTP requests. Please wait before requesting another code.");
                }
                tx.update(limitRef, { count: count + 1 });
            }
            else {
                // Reset window
                tx.set(limitRef, { count: 1, windowStart: admin.firestore.Timestamp.fromMillis(now) });
            }
        }
        else {
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
    }
    catch (emailErr) {
        console.error("[sendEmailOTP] Failed to send email:", emailErr);
        throw new https_1.HttpsError("internal", "Failed to send verification email. Please try again.");
    }
    return { success: true };
});
// ─── Cloud Function: verifyAuthOtpEmail ──────────────────────────────────────────
exports.verifyAuthOtpEmail = (0, https_1.onCall)({ secrets: [OTP_HMAC_SECRET], invoker: "public", cors: true }, async (request) => {
    var _a, _b, _c, _d, _e;
    const rawEmail = (((_a = request.data) === null || _a === void 0 ? void 0 : _a.email) || "").toString().trim().toLowerCase();
    const rawOtp = (((_b = request.data) === null || _b === void 0 ? void 0 : _b.otp) || "").toString().trim();
    const isSignup = Boolean((_c = request.data) === null || _c === void 0 ? void 0 : _c.isSignup);
    const signupData = (_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.signupData) !== null && _e !== void 0 ? _e : {};
    // Validate inputs
    if (!isValidEmail(rawEmail)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid email address.");
    }
    if (!/^\d{6}$/.test(rawOtp)) {
        throw new https_1.HttpsError("invalid-argument", "OTP must be exactly 6 digits.");
    }
    const secret = OTP_HMAC_SECRET.value();
    const emailHash = hashEmail(rawEmail, secret);
    const tokenRef = db.collection("emailOtpTokens").doc(emailHash);
    // Load and validate token doc inside a transaction to prevent race conditions
    let isNewUser = false;
    await db.runTransaction(async (tx) => {
        var _a, _b, _c;
        const tokenDoc = await tx.get(tokenRef);
        if (!tokenDoc.exists) {
            throw new https_1.HttpsError("not-found", "OTP not found or expired. Please request a new code.");
        }
        const tokenData = tokenDoc.data();
        const expiresAt = (_b = (_a = tokenData.expiresAt) === null || _a === void 0 ? void 0 : _a.toMillis()) !== null && _b !== void 0 ? _b : 0;
        const attempts = (_c = tokenData.attempts) !== null && _c !== void 0 ? _c : 0;
        // Check expiry
        if (Date.now() > expiresAt) {
            tx.delete(tokenRef);
            throw new https_1.HttpsError("deadline-exceeded", "OTP has expired. Please request a new code.");
        }
        // Check attempt limit (5 max)
        if (attempts >= 5) {
            tx.delete(tokenRef);
            throw new https_1.HttpsError("resource-exhausted", "Too many failed attempts. Please request a new OTP.");
        }
        // Verify OTP hash
        const expectedHash = hashOtp(rawOtp, secret);
        if (expectedHash !== tokenData.otpHash) {
            tx.update(tokenRef, { attempts: attempts + 1 });
            const remaining = 5 - (attempts + 1);
            throw new https_1.HttpsError("unauthenticated", remaining > 0
                ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
                : "Too many failed attempts. Please request a new OTP.");
        }
        // OTP is correct — delete token
        tx.delete(tokenRef);
    });
    // ── Lookup/create Firebase Auth user ──────────────────────────────────────
    let uid;
    try {
        const existingUser = await admin.auth().getUserByEmail(rawEmail);
        uid = existingUser.uid;
        // Mark email as verified in Firebase Auth
        await admin.auth().updateUser(uid, { emailVerified: true });
        isNewUser = false;
    }
    catch (err) {
        if (err.code === "auth/user-not-found") {
            if (!isSignup) {
                // Login flow — no account exists
                throw new https_1.HttpsError("not-found", "No account found for this email. Please sign up first.");
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
            const city = signupData.city || "Lucknow";
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
                }
                catch (refErr) {
                    console.warn("[verifyEmailOTP] Referral application failed:", refErr);
                }
            }
        }
        else {
            throw err;
        }
    }
    // Bypass createCustomToken by setting a strong random password 
    // and letting the client log in via Email/Password. This avoids IAM signBlob permission issues.
    const loginPassword = crypto.randomBytes(32).toString("hex");
    await admin.auth().updateUser(uid, { password: loginPassword });
    return { loginPassword, email: rawEmail, isNewUser };
});
// ─── Existing: generateReferralCode ──────────────────────────────────────────
function generateRandomCode(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
exports.createInviteCode = (0, https_1.onCall)({ invoker: "public", cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    }
    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    return await db.runTransaction(async (t) => {
        var _a;
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) {
            throw new https_1.HttpsError("not-found", "User document does not exist.");
        }
        const userData = userDoc.data();
        if (userData === null || userData === void 0 ? void 0 : userData.referralCode) {
            return { code: userData.referralCode };
        }
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
            referralCount: (_a = userData === null || userData === void 0 ? void 0 : userData.referralCount) !== null && _a !== void 0 ? _a : 0,
        });
        return { code: uniqueCode };
    });
});
// ─── Existing: submitInviteCode ──────────────────────────────────────────────────
exports.submitInviteCode = (0, https_1.onCall)({ invoker: "public", cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    }
    const uid = request.auth.uid;
    const { referralCode } = request.data;
    if (!referralCode || typeof referralCode !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Invalid referral code.");
    }
    return await db.runTransaction(async (t) => {
        var _a, _b;
        const currentUserRef = db.collection("users").doc(uid);
        const currentUserDoc = await t.get(currentUserRef);
        if (!currentUserDoc.exists) {
            throw new https_1.HttpsError("not-found", "User document does not exist.");
        }
        const currentUserData = currentUserDoc.data();
        if (currentUserData.referredBy) {
            throw new https_1.HttpsError("already-exists", "User has already used a referral code.");
        }
        const createdAt = (_a = currentUserData.createdAt) === null || _a === void 0 ? void 0 : _a.toDate();
        if (createdAt) {
            const diffHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
            if (diffHours > 24) {
                throw new https_1.HttpsError("failed-precondition", "Referral codes can only be applied to new accounts.");
            }
        }
        const referrerQuery = await t.get(db.collection("users").where("referralCode", "==", referralCode).limit(1));
        if (referrerQuery.empty) {
            throw new https_1.HttpsError("not-found", "Invalid referral code.");
        }
        const referrerDoc = referrerQuery.docs[0];
        const referrerId = referrerDoc.id;
        if (referrerId === uid) {
            throw new https_1.HttpsError("invalid-argument", "You cannot use your own referral code.");
        }
        t.update(currentUserRef, { referredBy: referrerId });
        const referrerRef = db.collection("users").doc(referrerId);
        const currentCount = ((_b = referrerDoc.data()) === null || _b === void 0 ? void 0 : _b.referralCount) || 0;
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
function getTransporter(emailPass) {
    return nodemailer.createTransport({
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: { user: "resend", pass: emailPass },
    });
}
async function canSendEmail(userId) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists)
        return { ok: false, email: null, firstName: "there" };
    const data = userSnap.data();
    if (data.emailOptOut === true)
        return { ok: false, email: null, firstName: ((_a = data.name) === null || _a === void 0 ? void 0 : _a.split(" ")[0]) || "there" };
    if (!data.email)
        return { ok: false, email: null, firstName: ((_b = data.name) === null || _b === void 0 ? void 0 : _b.split(" ")[0]) || "there" };
    if (data.online === true)
        return { ok: false, email: data.email, firstName: ((_c = data.name) === null || _c === void 0 ? void 0 : _c.split(" ")[0]) || "there" };
    const lastEmail = (_f = (_e = (_d = data.lastEmailNotification) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0;
    const msSince = Date.now() - lastEmail;
    if (msSince < COOLDOWN_MS)
        return { ok: false, email: data.email, firstName: ((_g = data.name) === null || _g === void 0 ? void 0 : _g.split(" ")[0]) || "there" };
    return { ok: true, email: data.email, firstName: ((_h = data.name) === null || _h === void 0 ? void 0 : _h.split(" ")[0]) || "there" };
}
async function markEmailSent(userId) {
    await db.collection("users").doc(userId).update({
        lastEmailNotification: admin.firestore.FieldValue.serverTimestamp(),
    });
}
// ─── Shared Email Template Builder ────────────────────────────────────────────
function buildEmailHtml(opts) {
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
exports.notifyOnNewMessage = (0, firestore_1.onDocumentCreated)({ document: "chatRooms/{roomId}/messages/{messageId}", secrets: [EMAIL_PASS] }, async (event) => {
    var _a, _b;
    const snapshot = event.data;
    if (!snapshot)
        return;
    const msgData = snapshot.data();
    const senderId = msgData.senderId;
    if (!senderId)
        return;
    const roomId = event.params.roomId;
    const roomSnap = await db.collection("chatRooms").doc(roomId).get();
    if (!roomSnap.exists)
        return;
    const participants = ((_a = roomSnap.data()) === null || _a === void 0 ? void 0 : _a.participants) || [];
    const receiverId = participants.find((id) => id !== senderId);
    if (!receiverId)
        return;
    const { ok, email, firstName } = await canSendEmail(receiverId);
    if (!ok || !email)
        return;
    const senderSnap = await db.collection("users").doc(senderId).get();
    const senderName = ((_b = senderSnap.data()) === null || _b === void 0 ? void 0 : _b.name) || "Someone";
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
    }
    catch (err) {
        console.error("[DM email] failed:", err);
    }
});
// ─── Email #2: Product Reserved Alert ─────────────────────────────────────────
exports.notifyOnProductReserved = (0, firestore_1.onDocumentUpdated)({ document: "products/{productId}", secrets: [EMAIL_PASS] }, async (event) => {
    var _a, _b, _c;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    // Only fire when status changes TO 'reserved'
    if (before.status === after.status || after.status !== "reserved")
        return;
    const sellerId = after.sellerId;
    const buyerId = after.reservedById;
    if (!sellerId || !buyerId)
        return;
    const { ok, email, firstName } = await canSendEmail(sellerId);
    if (!ok || !email)
        return;
    const buyerSnap = await db.collection("users").doc(buyerId).get();
    const buyerName = ((_c = buyerSnap.data()) === null || _c === void 0 ? void 0 : _c.name) || "A student";
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
    }
    catch (err) {
        console.error("[Reserve email] failed:", err);
    }
});
// ─── Email #3: Weekly Digest (Re-engagement) ──────────────────────────────────
exports.sendWeeklyDigest = (0, scheduler_1.onSchedule)({ schedule: "every sunday 10:00", timeZone: "Asia/Kolkata", secrets: [EMAIL_PASS] }, async () => {
    var _a, _b, _c, _d, _e, _f;
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
        if (!user.email || !user.name)
            continue;
        if (user.online === true)
            continue;
        if (user.emailOptOut === true)
            continue;
        const lastSeen = (_c = (_b = (_a = user.lastSeen) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
        if (now - lastSeen < sevenDaysMs)
            continue; // Still active — skip
        const lastEmail = (_f = (_e = (_d = user.lastEmailNotification) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0;
        if (now - lastEmail < DAILY_LIMIT_MS)
            continue; // Already emailed recently
        // Fetch 3 new products from their school/city
        let products = [];
        try {
            const pSnap = await db.collection("products")
                .where("status", "==", "available")
                .orderBy("createdAt", "desc")
                .limit(4)
                .get();
            products = pSnap.docs
                .filter((d) => d.data().sellerId !== userDoc.id)
                .slice(0, 3)
                .map((d) => (Object.assign({ id: d.id }, d.data())));
        }
        catch (_g) { }
        if (products.length === 0)
            continue; // Nothing to show
        const firstName = user.name.split(" ")[0];
        const productCardsHtml = products.map((p) => `
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
        }
        catch (err) {
            console.error(`[Digest] failed for ${user.email}:`, err);
        }
    }
    console.log(`[Weekly Digest] Sent to ${sent} users.`);
    await db.collection("emailBroadcasts").add({
        type: "weekly_digest",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        recipientCount: sent,
    });
});
// ─── Email #4: Admin Broadcast ─────────────────────────────────────────────────
exports.broadcastEmail = (0, https_1.onCall)({ secrets: [EMAIL_PASS], invoker: "public", cors: true, timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    var _a, _b, _c;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const adminSnap = await db.collection("users").doc(uid).get();
    if (!((_b = adminSnap.data()) === null || _b === void 0 ? void 0 : _b.isAdmin))
        throw new https_1.HttpsError("permission-denied", "Admins only.");
    const { subject, bodyHtml, broadcastId } = request.data;
    if (!subject || !bodyHtml)
        throw new https_1.HttpsError("invalid-argument", "subject and bodyHtml are required.");
    if (subject.length > 200)
        throw new https_1.HttpsError("invalid-argument", "Subject too long.");
    // Idempotency: prevent double sends
    const broadcastRef = db.collection("emailBroadcasts").doc(broadcastId);
    const existing = await broadcastRef.get();
    if (existing.exists)
        throw new https_1.HttpsError("already-exists", "This broadcast was already sent.");
    const usersSnap = await db.collection("users").limit(2000).get();
    const transporter = getTransporter(EMAIL_PASS.value());
    let sent = 0;
    let failed = 0;
    for (const userDoc of usersSnap.docs) {
        const user = userDoc.data();
        if (!user.email || user.emailOptOut === true)
            continue;
        const firstName = ((_c = user.name) === null || _c === void 0 ? void 0 : _c.split(" ")[0]) || "there";
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
        }
        catch (err) {
            console.error(`Failed to send broadcast email to ${user.email}:`, err);
            failed++;
        }
    }
    await broadcastRef.set({
        subject,
        sentBy: uid,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        recipientCount: sent,
        failedCount: failed,
    });
    return { success: true, sent, failed };
});
// ─── Unsubscribe Endpoint ─────────────────────────────────────────────────────
exports.unsubscribeFromEmails = (0, https_1.onCall)({ invoker: "public", cors: true }, async (request) => {
    const { uid } = request.data;
    if (!uid)
        throw new https_1.HttpsError("invalid-argument", "uid required.");
    await db.collection("users").doc(uid).update({ emailOptOut: true });
    return { success: true };
});
//# sourceMappingURL=index.js.map