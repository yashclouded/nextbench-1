import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../lib/firebase';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../lib/AuthContext';

// Shared entrance choreography — reused for every top-level block on the page
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function Login() {
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const redirectedRef = useRef(false);

  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);

  // Redirect already-authenticated users (previous session only — not during active sign-in)
  useEffect(() => {
    if (!loading && user && !isSigningIn && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, isSigningIn, navigate]);

  useEffect(() => {
    const handleEmailLinkLogin = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        setIsSigningIn(true);
        let savedEmail = window.localStorage.getItem('emailForSignIn');
        if (!savedEmail) {
          savedEmail = window.prompt('Please provide your email for confirmation');
        }

        if (savedEmail) {
          try {
            const result = await signInWithEmailLink(auth, savedEmail, window.location.href);
            window.localStorage.removeItem('emailForSignIn');

            // Check if this account has a registered Nextbench profile
            const docRef = doc(db, 'users', result.user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
              await signOut(auth);
              setNotFound(true);
              setIsSigningIn(false);
              return;
            }

            navigate('/dashboard', { replace: true });
          } catch (err: any) {
            console.error('Email Link Login Error:', err);
            setError(err.message || 'Failed to authenticate with link.');
            setIsSigningIn(false);
          }
        } else {
          setIsSigningIn(false);
        }
      }
    };

    handleEmailLinkLogin();
  }, [navigate]);

  const handleGoogleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotFound(false);
    setIsSigningIn(true); // Prevent AuthContext redirect from firing mid-flow

    const provider = new GoogleAuthProvider();

    try {
      let result;
      try {
        result = await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }

      // Check if this Google account has a registered Nextbench profile
      const docRef = doc(db, 'users', result.user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        // No account — sign them out and tell them to sign up
        await signOut(auth);
        setNotFound(true);
        setIsSigningIn(false);
        return;
      }

      const data = docSnap.data();

      // Everyone goes to dashboard, where interaction guards will restrict them
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      console.error('Login Error:', err);
      setError(err.message || 'Failed to authenticate. Please try again.');
      setIsSigningIn(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError('');
    setNotFound(false);
    setIsSigningIn(true);

    const actionCodeSettings = {
      url: window.location.origin + '/login',
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      setLinkSent(true);
    } catch (err: any) {
      console.error('Email Login Error:', err);
      setError(err.message || 'Failed to send login link');
    } finally {
      setIsSigningIn(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center px-6 pt-20 pb-10">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-sm"
      >
        <motion.div variants={itemVariants} className="text-center mb-16">
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

        {/* Error banner — now collapses smoothly instead of popping out of existence */}
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
              <div className="p-4 bg-red-50 text-red-600 text-xs font-bold uppercase tracking-widest text-center border border-red-100 rounded-sm">
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* "Account not found" card — guides unregistered users to sign up */}
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
                This Google account isn't registered on Nextbench yet.
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

        <motion.div variants={itemVariants} className="space-y-4">
          <form onSubmit={handleGoogleLogin}>
            <motion.button
              whileHover={!isSigningIn ? { scale: 1.015, y: -1 } : undefined}
              whileTap={!isSigningIn ? { scale: 0.97 } : undefined}
              transition={{ duration: 0.15 }}
              type="submit"
              disabled={isSigningIn}
              className="w-full bg-luxury-ink text-surface-base py-4 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-luxury-ink/10 hover:bg-brand-teal transition-colors flex items-center justify-center gap-3 group disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
            >
              <ShieldCheck size={16} className="opacity-60 group-hover:opacity-100 transition-opacity" />
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isSigningIn ? 'verifying' : 'idle'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {isSigningIn ? 'Verifying...' : 'Continue with Google'}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </form>

          <div className="relative py-4 flex items-center">
            <div className="grow border-t border-luxury-ink/10"></div>
            <span className="shrink-0 mx-4 text-luxury-ink/30 text-[10px] font-bold uppercase tracking-widest">Or</span>
            <div className="grow border-t border-luxury-ink/10"></div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <AnimatePresence mode="wait" initial={false}>
              {linkSent ? (
                <motion.div
                  key="link-sent"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25 }}
                  className="bg-brand-teal/5 border border-brand-teal/20 p-4 rounded-xl text-center"
                >
                  <p className="text-brand-teal text-sm font-bold mb-1">Check your inbox</p>
                  <p className="text-luxury-ink/60 text-xs">We've sent a magic link to {email}</p>
                </motion.div>
              ) : (
                <motion.div
                  key="email-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <motion.input
                    whileFocus={{ scale: 1.01 }}
                    transition={{ duration: 0.15 }}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className="w-full bg-surface-base border border-luxury-ink/10 rounded-sm py-4 px-4 text-sm font-medium focus:outline-none focus:border-brand-teal transition-colors"
                  />
                  <motion.button
                    whileHover={!isSigningIn && email ? { scale: 1.015, y: -1 } : undefined}
                    whileTap={!isSigningIn && email ? { scale: 0.97 } : undefined}
                    transition={{ duration: 0.15 }}
                    type="submit"
                    disabled={isSigningIn || !email}
                    className="w-full bg-transparent border border-luxury-ink text-luxury-ink py-4 rounded-sm font-bold text-xs uppercase tracking-[0.2em] hover:bg-luxury-ink hover:text-surface-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSigningIn ? 'Sending...' : 'Send Magic Link'}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </motion.div>

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
 