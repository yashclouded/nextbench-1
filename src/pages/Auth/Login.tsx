import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../lib/firebase';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../lib/AuthContext';

export default function Login() {
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const redirectedRef = useRef(false);

  // Redirect already-authenticated users (previous session only — not during active sign-in)
  useEffect(() => {
    if (!loading && user && !isSigningIn && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, isSigningIn, navigate]);

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

  if (loading) return null;

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center px-6 pt-20 pb-10">
      <div className="w-full max-w-sm">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
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
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 text-red-600 text-xs font-bold uppercase tracking-widest text-center border border-red-100 rounded-sm"
          >
            {error}
          </motion.div>
        )}

        {/* "Account not found" card — guides unregistered users to sign up */}
        <AnimatePresence>
          {notFound && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="mb-8 p-6 bg-brand-pink/5 border border-brand-pink/20 rounded-2xl text-center"
            >
              <div className="w-12 h-12 bg-brand-pink/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus size={22} className="text-brand-pink" />
              </div>
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

        <form onSubmit={handleGoogleLogin} className="space-y-6">
          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full bg-luxury-ink text-surface-base py-5 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-luxury-ink/10 hover:bg-brand-teal transition-all active:scale-[0.98] flex items-center justify-center gap-3 group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <ShieldCheck size={16} className="opacity-60 group-hover:opacity-100 transition-opacity" />
            {isSigningIn ? 'Verifying...' : 'Authenticate Identity with Google'}
          </button>
        </form>

        <div className="mt-16 pt-10 border-t border-brand-teal/5">
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-brand-teal/40">
            New to Nextbench?{' '}
            <Link to="/signup" className="text-brand-pink hover:text-brand-teal transition-colors">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
