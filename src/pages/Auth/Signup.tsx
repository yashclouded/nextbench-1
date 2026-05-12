import { motion, AnimatePresence } from 'motion/react';
import { User, Mail, Lock, Building, ArrowRight, ShieldCheck, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

const SCHOOLS = [
  "Loreto Convent",
  "La Martinière College",
  "CMS Gomtinagar - 1",
  "La Martinière Girls' College",
  "CMS Cambridge",
  "St. Francis Lucknow",
  "Seth M.R. Jaipuria School",
  "Delhi Public School Jankipuram"
];

function ContactModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setResult("");
    
    const formData = new FormData(event.currentTarget);
    formData.append("access_key", "6b3dde00-b0c3-47b9-9721-8cc626fa1a77");

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      setResult(data.success ? "Success! We will review and add your school." : "Error submitting request.");
      if (data.success) {
        setTimeout(onClose, 2000);
      }
    } catch (error) {
      setResult("Network error. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
      >
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl w-full max-w-md p-8 relative shadow-2xl border border-luxury-ink/5"
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-luxury-ink/40 hover:text-luxury-ink transition-colors"
          >
            <X size={20} />
          </button>
          
          <h3 className="text-xl font-bold text-luxury-ink mb-2">Request School Addition</h3>
          <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/40 mb-8">
            Tell us about your campus.
          </p>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Your Name</label>
              <input 
                type="text" 
                name="name" 
                required
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">School Email Address</label>
              <input 
                type="email" 
                name="email" 
                required
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Message (School Name & Website)</label>
              <textarea 
                name="message" 
                required
                rows={3}
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium resize-none"
              ></textarea>
            </div>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-brand-teal text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg shadow-brand-teal/20 hover:bg-brand-pink transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </button>
            {result && (
              <p className={`text-center text-xs font-bold tracking-widest uppercase mt-4 ${result.includes('Success') ? 'text-brand-mint' : 'text-red-500'}`}>
                {result}
              </p>
            )}
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function Signup() {
  const [school, setSchool] = useState('');
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!school) {
      setError('Please select/enter your school.');
      return;
    }

    try {
      // Store school in localStorage to persist across redirect
      localStorage.setItem('pending_school', school);
      const provider = new GoogleAuthProvider();
      // Use redirect instead of popup for better mobile/in-app browser support
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      console.error("Signup Error Details:", err);
      setError(err.message || 'Failed to initialize authentication');
    }
  };

  // Handle the redirect result when the page reloads
  React.useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          const savedSchool = localStorage.getItem('pending_school');
          
          if (!savedSchool) {
            setError('School selection lost. Please try again.');
            return;
          }

          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists()) {
            await setDoc(docRef, {
              name: user.displayName || 'Unknown Student',
              email: user.email || '',
              school: savedSchool,
              verified: false,
              verificationStatus: 'pending',
              reputation: 5.0,
              isAdmin: false,
              profilePicture: user.photoURL || null,
              idCardUrl: null,
              selfieUrl: null,
              about: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            localStorage.removeItem('pending_school');
            navigate('/verification');
          } else {
            localStorage.removeItem('pending_school');
            const existingData = docSnap.data();
            if (existingData.verified) {
              navigate('/marketplace');
            } else {
              navigate('/verification');
            }
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
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 pt-20 bg-surface-base">
      {/* Left: Form */}
      <div className="flex items-center justify-center px-8 py-20">
        <div className="w-full max-w-sm">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-16"
          >
            <div className="inline-block px-3 py-1 bg-brand-mint/20 text-brand-teal text-[11px] font-bold uppercase tracking-[0.2em] mb-8 rounded-full">
              Registration
            </div>
            <h1 className="text-5xl font-light text-luxury-ink mb-4 leading-tight">
              Join the <span className="italic font-serif text-brand-pink-soft">Network</span>.
            </h1>
            <p className="text-brand-teal/50 text-xs font-bold uppercase tracking-widest leading-relaxed">
              Mandatory verification for all members.
            </p>
          </motion.div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-xs font-bold uppercase tracking-widest text-center border border-red-100 rounded-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">School / Institute</label>
              <select 
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className="w-full bg-white border border-brand-teal/10 rounded-sm py-4 px-6 shadow-sm focus:outline-none focus:border-brand-pink transition-all text-sm font-medium appearance-none"
                required
              >
                <option value="" disabled>Select Campus</option>
                {SCHOOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            
            <div className="flex justify-start px-1 mt-2">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(true)}
                className="text-[10px] font-bold uppercase tracking-widest text-brand-teal hover:text-brand-pink transition-colors"
              >
                Not your school here?
              </button>
            </div>

            <button 
              type="submit"
              className="w-full bg-brand-pink text-white py-5 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand-pink/10 hover:bg-brand-teal transition-all active:scale-[0.98]"
            >
              Initialize Verification with Google
            </button>
          </form>

          <p className="mt-16 text-center text-[11px] font-bold uppercase tracking-widest text-brand-teal/40">
            Already a member? <Link to="/login" className="text-brand-teal hover:text-brand-pink transition-colors">Sign In</Link>
          </p>
        </div>
      </div>

      {/* Right: Brand Asset */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-brand-teal p-20 relative overflow-hidden">
        <div className="relative z-10 text-center max-w-sm">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-white/20">
            <ShieldCheck className="text-brand-mint w-8 h-8" />
          </div>
          <h2 className="text-6xl font-serif italic text-white mb-8 leading-[1.1]">Verified <br />Students Only.</h2>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest leading-relaxed mb-12">
            Every member is manually vetted to ensure total campus trust.
          </p>
          <div className="grid grid-cols-2 gap-px bg-white/10">
            <div className="p-8 bg-brand-teal">
              <p className="text-3xl font-light text-white mb-2">12k+</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Members</p>
            </div>
            <div className="p-8 bg-brand-teal">
              <p className="text-3xl font-light text-white mb-2">100%</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Secure</p>
            </div>
          </div>
        </div>
        
        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
      </div>
      
      <ContactModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
