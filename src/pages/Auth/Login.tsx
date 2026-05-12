import { motion } from 'motion/react';
import { ShieldCheck, Mail, Lock, ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleGoogleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      // Use redirect instead of popup for better mobile/in-app browser support
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      console.error("Login Error Details:", err);
      setError(err.message || 'Failed to initialize authentication');
    }
  };

  // Handle the redirect result when the page reloads
  React.useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // Check if user exists in database
          const docRef = doc(db, 'users', result.user.uid);
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists()) {
            await signOut(auth);
            setError("Account not found. Please sign up first.");
            return;
          }
          
          const data = docSnap.data();
          if (data.verificationStatus === 'rejected') {
            navigate('/verification?rejected=true');
            return;
          }
          
          // Verified users go straight to marketplace; others go to verification
          if (data.verified) {
            navigate('/marketplace');
          } else {
            navigate('/verification');
          }
        }
      } catch (err: any) {
        console.error("Redirect Result Error:", err);
        setError(err.message || 'Failed to complete authentication');
      }
    };

    handleRedirect();
  }, [navigate]);

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

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 text-xs font-bold uppercase tracking-widest text-center border border-red-100 rounded-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleGoogleLogin} className="space-y-6">
          <button 
            type="submit"
            className="w-full bg-luxury-ink text-white py-5 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-luxury-ink/10 hover:bg-brand-teal transition-all active:scale-[0.98] flex items-center justify-center gap-3 group"
          >
            Authenticate Identity with Google
          </button>
        </form>

        <div className="mt-16 pt-10 border-t border-brand-teal/5">
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-brand-teal/40">
            Unverified? <Link to="/signup" className="text-brand-pink hover:text-brand-teal transition-colors">Submit Application</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
