import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, UserPlus, Mail, ArrowLeft, RotateCcw, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth, db, functions } from '../../lib/firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword,
  signInWithCustomToken,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../lib/AuthContext';

// ─── Animation variants (unchanged visual style) ──────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

// ─── 6-Digit OTP Input ────────────────────────────────────────────────────────
function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKeyDown = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(-1);
    const arr = value.split('');
    arr[i] = v;
    const next = arr.join('').padEnd(6, '').slice(0, 6);
    onChange(next);
    if (v && i < 5) {
      inputs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted.padEnd(6, '').slice(0, 6));
      const focusIdx = Math.min(pasted.length, 5);
      inputs.current[focusIdx]?.focus();
    }
    e.preventDefault();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={handleChange(i)}
          onKeyDown={handleKeyDown(i)}
          onPaste={handlePaste}
          disabled={disabled}
          className="w-11 h-14 text-center text-xl font-bold border border-luxury-ink/15 rounded-xl bg-surface-base focus:outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20 transition-all disabled:opacity-50 text-luxury-ink"
        />
      ))}
    </div>
  );
}

// ─── Countdown Timer ──────────────────────────────────────────────────────────
function Countdown({ seconds, onEnd }: { seconds: number; onEnd: () => void }) {
  const [left, setLeft] = useState(seconds);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    setLeft(seconds);
    const id = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          onEndRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [seconds]);

  return (
    <span className="tabular-nums text-brand-teal font-bold">
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
type LoginStep = 'email' | 'otp';

export default function Login() {
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendKey, setResendKey] = useState(0); // bump to restart countdown
  const [isSigningIn, setIsSigningIn] = useState(false);

  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const redirectedRef = useRef(false);

  // Redirect already-authenticated users
  useEffect(() => {
    if (!loading && user && !isSigningIn && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, isSigningIn, navigate]);

  if (loading) return null;

  // ── Google OAuth ─────────────────────────────────────────────────────────
  const handleGoogleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotFound(false);
    setIsSigningIn(true);

    const provider = new GoogleAuthProvider();
    try {
      let result;
      try {
        result = await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        if (
          popupErr.code === 'auth/popup-blocked' ||
          popupErr.code === 'auth/cancelled-popup-request'
        ) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }

      const docSnap = await getDoc(doc(db, 'users', result.user.uid));
      if (!docSnap.exists()) {
        await signOut(auth);
        setNotFound(true);
        setIsSigningIn(false);
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      console.error('[Login] Google error:', err);
      setError(err.message || 'Failed to authenticate. Please try again.');
      setIsSigningIn(false);
    }
  };

  // ── Send OTP ──────────────────────────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setError('');
    setNotFound(false);
    setIsLoading(true);

    try {
      const sendFn = httpsCallable(functions, 'sendAuthOtpEmail');
      await sendFn({ email: email.trim().toLowerCase() });
      setOtp('');
      setCanResend(false);
      setResendKey((k) => k + 1);
      setStep('otp');
    } catch (err: any) {
      const msg = err?.details?.message || err?.message || 'Failed to send OTP.';
      setError(msg.replace('Error: ', '').replace('[sendAuthOtpEmail] ', ''));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otp.replace(/\s/g, '').length < 6) return;
    setError('');
    setIsLoading(true);
    setIsSigningIn(true);

    try {
      const verifyFn = httpsCallable(functions, 'verifyAuthOtpEmail');
      const result: any = await verifyFn({ email: email.trim().toLowerCase(), otp });

      // Preferred: custom token (no password mutation). Fall back to the legacy
      // email/password path if the backend couldn't mint a token (IAM not yet set).
      if (result.data?.customToken) {
        await signInWithCustomToken(auth, result.data.customToken);
      } else if (result.data?.loginPassword && result.data?.email) {
        await signInWithEmailAndPassword(auth, result.data.email, result.data.loginPassword);
      } else {
        throw new Error('Authentication failed.');
      }

      // Check Firestore profile exists
      const authUser = auth.currentUser;
      if (authUser) {
        const docSnap = await getDoc(doc(db, 'users', authUser.uid));
        if (!docSnap.exists()) {
          await signOut(auth);
          setNotFound(true);
          setIsSigningIn(false);
          setStep('email');
          return;
        }
      }

      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const raw = err?.details?.message || err?.message || 'Verification failed.';
      const msg = raw.replace('Error: ', '').replace('[verifyEmailOTP] ', '');
      setError(msg);
      // If no account found, go back to email step after showing error briefly
      if (raw.includes('No account found')) {
        setTimeout(() => {
          setNotFound(true);
          setStep('email');
        }, 1200);
      }
      setIsSigningIn(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-submit when all 6 digits are entered
  const handleOtpChange = useCallback((val: string) => {
    setOtp(val);
    if (val.replace(/\D/g, '').length === 6 && !isLoading) {
      // slight delay so user can see the filled box before submission
      setTimeout(() => handleVerifyOtp(), 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center px-6 pt-20 pb-10">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-sm"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="text-center mb-12">
          <div className="inline-block px-3 py-1 bg-brand-mint/20 text-brand-teal text-[11px] font-bold uppercase tracking-[0.2em] mb-8 rounded-full">
            Secured Portal
          </div>
          <h1 className="text-5xl font-light text-luxury-ink mb-4 leading-tight">
            Welcome <span className="italic font-serif text-brand-teal">Back</span>.
          </h1>
          <p className="text-brand-teal/50 text-xs font-bold uppercase tracking-widest leading-relaxed">
            Access your verified campus dashboard.
          </p>
        </motion.div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="error-banner"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="p-4 bg-brand-pink/10 text-brand-pink text-xs font-bold uppercase tracking-widest text-center border border-brand-pink/20 rounded-sm">
                {error === "INTERNAL" ? "Server Error: Could not connect to verification service" : error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* "Account not found" card */}
        <AnimatePresence>
          {notFound && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mb-8 p-6 bg-brand-pink/5 border border-brand-pink/20 rounded-2xl text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 18 }}
                className="w-12 h-12 bg-brand-pink/10 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <UserPlus size={22} className="text-brand-pink" />
              </motion.div>
              <h3 className="text-sm font-bold text-luxury-ink mb-2">No account found</h3>
              <p className="text-xs text-luxury-ink/50 leading-relaxed mb-5">
                This account isn't registered on Nextbench yet.
                Create your verified student account to get started.
              </p>
              <Link
                to="/signup"
                className="inline-block w-full py-4 bg-brand-pink text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded-xl hover:bg-brand-teal transition-colors shadow-lg shadow-brand-pink/10"
              >
                Create Account →
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main auth forms */}
        <motion.div variants={itemVariants}>
          <AnimatePresence mode="wait" initial={false}>
            {/* ── Step 1: Email entry ── */}
            {step === 'email' && (
              <motion.div
                key="step-email"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                {/* Email OTP */}
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="relative">
                    <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/30 pointer-events-none" />
                    <motion.input
                      whileFocus={{ scale: 1.01 }}
                      transition={{ duration: 0.15 }}
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setNotFound(false); }}
                      placeholder="Enter your email"
                      required
                      autoComplete="email"
                      className="w-full bg-surface-base border border-luxury-ink/10 rounded-sm py-4 pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-brand-teal transition-colors"
                    />
                  </div>
                  <motion.button
                    whileHover={!isLoading && email ? { scale: 1.015, y: -1 } : undefined}
                    whileTap={!isLoading && email ? { scale: 0.97 } : undefined}
                    transition={{ duration: 0.15 }}
                    type="submit"
                    disabled={isLoading || !email}
                    className="w-full bg-brand-pink text-white py-4 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand-pink/10 hover:bg-brand-teal transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <KeyRound size={14} />
                    {isLoading ? 'Sending…' : 'Send One-Time Code'}
                  </motion.button>
                </form>

                {/* Divider */}
                <div className="relative py-6 flex items-center">
                  <div className="grow border-t border-luxury-ink/10" />
                  <span className="shrink-0 mx-4 text-luxury-ink/30 text-[10px] font-bold uppercase tracking-widest">
                    Or
                  </span>
                  <div className="grow border-t border-luxury-ink/10" />
                </div>

                {/* Google */}
                <form onSubmit={handleGoogleLogin}>
                  <motion.button
                    whileHover={!isSigningIn && !isLoading ? { scale: 1.015, y: -1 } : undefined}
                    whileTap={!isSigningIn && !isLoading ? { scale: 0.97 } : undefined}
                    transition={{ duration: 0.15 }}
                    type="submit"
                    disabled={isSigningIn || isLoading}
                    className="w-full bg-transparent border border-luxury-ink/20 text-luxury-ink py-4 rounded-sm font-bold text-xs uppercase tracking-[0.2em] hover:bg-luxury-ink/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
                  >
                    <ShieldCheck size={16} className="text-luxury-ink/60 group-hover:text-luxury-ink transition-colors" />
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={isSigningIn ? 'verifying' : 'idle'}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                      >
                        {isSigningIn ? 'Verifying…' : 'Continue with Google'}
                      </motion.span>
                    </AnimatePresence>
                  </motion.button>
                </form>
              </motion.div>
            )}

            {/* ── Step 2: OTP verification ── */}
            {step === 'otp' && (
              <motion.div
                key="step-otp"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-6"
              >
                {/* Back button + description */}
                <div className="text-center">
                  <div className="w-14 h-14 bg-brand-teal/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail size={24} className="text-brand-teal" />
                  </div>
                  <p className="text-luxury-ink/70 text-sm leading-relaxed">
                    We've sent a 6-digit code to
                  </p>
                  <p className="text-luxury-ink font-bold text-sm mt-1">{email}</p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <OtpInput
                    value={otp}
                    onChange={handleOtpChange}
                    disabled={isLoading}
                  />

                  <motion.button
                    whileHover={!isLoading && otp.replace(/\D/g, '').length === 6 ? { scale: 1.015, y: -1 } : undefined}
                    whileTap={!isLoading && otp.replace(/\D/g, '').length === 6 ? { scale: 0.97 } : undefined}
                    transition={{ duration: 0.15 }}
                    type="submit"
                    disabled={isLoading || otp.replace(/\D/g, '').length < 6}
                    className="w-full bg-brand-teal text-white py-4 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-teal/15 hover:bg-luxury-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <ShieldCheck size={14} />
                    {isLoading ? 'Verifying…' : 'Verify Code'}
                  </motion.button>
                </form>

                {/* Resend + back controls */}
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
                  <button
                    onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                    className="flex items-center gap-1.5 text-luxury-ink/40 hover:text-luxury-ink transition-colors"
                  >
                    <ArrowLeft size={12} />
                    Change email
                  </button>

                  {canResend ? (
                    <button
                      onClick={() => handleSendOtp()}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 text-brand-teal hover:text-brand-pink transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={12} />
                      Resend code
                    </button>
                  ) : (
                    <span className="text-luxury-ink/30">
                      Resend in <Countdown key={resendKey} seconds={60} onEnd={() => setCanResend(true)} />
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Footer */}
        <motion.div variants={itemVariants} className="mt-16 pt-10 border-t border-brand-teal/5">
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-brand-teal/40">
            New to Nextbench?{' '}
            <Link to="/signup" className="text-brand-pink hover:text-brand-teal transition-colors">
              Create Account
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}