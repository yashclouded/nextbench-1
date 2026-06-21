import { motion, AnimatePresence } from 'motion/react';
import { Building, ShieldCheck, X, Search, ChevronDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../lib/firebase';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs, addDoc, query, where, limit, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../lib/AuthContext';
import { uploadSchoolIdCard } from '../../lib/storage';

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

// ─── Searchable School Dropdown ──────────────────────────────────────────────

interface SchoolDropdownProps {
  value: string;
  onChange: (val: string) => void;
  schools: { name: string; city: string }[];
}

function SchoolDropdown({ value, onChange, schools }: SchoolDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.city.toLowerCase().includes(query.toLowerCase())
  );

  const selectedSchool = schools.find(s => s.name === value);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full bg-surface-card border border-brand-teal/10 rounded-sm py-4 px-6 shadow-sm focus:outline-none focus:border-brand-pink transition-all text-sm font-medium text-left flex items-center justify-between"
      >
        <span className={selectedSchool ? 'text-luxury-ink' : 'text-luxury-ink/30'}>
          {selectedSchool ? `${selectedSchool.name} (${selectedSchool.city})` : 'Select Campus'}
        </span>
        <ChevronDown
          size={16}
          className={`text-luxury-ink/30 transition-transform shrink-0 ml-2 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 bg-surface-card border border-brand-teal/10 rounded-sm shadow-xl overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-luxury-ink/5">
              <Search size={14} className="text-luxury-ink/30 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search school or city…"
                className="flex-1 bg-transparent text-sm font-medium focus:outline-none placeholder:text-luxury-ink/30"
              />
            </div>

            {/* Results */}
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-6 py-4 text-xs text-luxury-ink/30 font-bold uppercase tracking-widest">
                  No results
                </p>
              ) : (
                filtered.map(s => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => handleSelect(s.name)}
                    className={`w-full text-left px-6 py-3 text-sm font-medium transition-colors hover:bg-brand-teal/5 ${
                      s.name === value ? 'text-brand-teal bg-brand-teal/5' : 'text-luxury-ink'
                    }`}
                  >
                    {s.name}
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">
                      {s.city}
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Contact / Request School Modal ──────────────────────────────────────────

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the submitted school name so parent can auto-sign-in */
  onSchoolSubmitted: (schoolName: string) => void;
}

function ContactModal({ isOpen, onClose, onSchoolSubmitted }: ContactModalProps) {
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!idCardFile) {
      setResult("Please upload an ID card.");
      return;
    }

    setIsSubmitting(true);
    setResult("");

    const formData = new FormData(event.currentTarget);
    const schoolName = formData.get("schoolName") as string;
    const city = formData.get("city") as string;
    const website = formData.get("website") as string;
    const requesterName = formData.get("requesterName") as string;
    const requesterEmail = formData.get("requesterEmail") as string;

    try {
      const idCardUrl = await uploadSchoolIdCard(idCardFile);

      await addDoc(collection(db, 'school_requests'), {
        schoolName,
        city,
        website,
        requesterName,
        requesterEmail,
        idCardUrl,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setResult("Request submitted! Starting verification…");

      // Short delay so the user sees the success message, then hand off to parent
      setTimeout(() => {
        onSchoolSubmitted(schoolName);
      }, 1200);
    } catch (error) {
      setResult("Network error. Please try again later.");
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
        className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-surface-card rounded-2xl w-full max-w-md p-8 relative shadow-2xl border border-luxury-ink/5"
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

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Your Name</label>
              <input
                type="text"
                name="requesterName"
                required
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-3 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Your Email</label>
              <input
                type="email"
                name="requesterEmail"
                required
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-3 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">School Name</label>
              <input
                type="text"
                name="schoolName"
                required
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-3 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">City</label>
              <input
                type="text"
                name="city"
                required
                placeholder="e.g., Lucknow"
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-3 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">School Website</label>
              <input
                type="url"
                name="website"
                required
                placeholder="https://"
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-3 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Student ID Card (Image)</label>
              <input
                type="file"
                accept="image/*"
                required
                onChange={(e) => setIdCardFile(e.target.files?.[0] || null)}
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-3 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-xs file:font-bold file:bg-brand-teal/10 file:text-brand-teal hover:file:bg-brand-teal/20"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-brand-teal text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg shadow-brand-teal/20 hover:bg-brand-pink transition-colors disabled:opacity-50 mt-4"
            >
              {isSubmitting ? "Submitting…" : "Submit & Continue with Google"}
            </button>
            {result && (
              <p className={`text-center text-xs font-bold tracking-widest uppercase mt-4 ${result.includes('submitted') ? 'text-brand-mint' : 'text-red-500'}`}>
                {result}
              </p>
            )}
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Main Signup Page ─────────────────────────────────────────────────────────

export default function Signup() {
  const [school, setSchool] = useState('');
  const [schoolsList, setSchoolsList] = useState<{ name: string; city: string }[]>([]);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState(localStorage.getItem('pendingReferral') || '');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const redirectedRef = useRef(false);

  // Fetch schools
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const snap = await getDocs(collection(db, 'schools'));
        if (!snap.empty) {
          const fetched = snap.docs.map(d => ({
            name: d.data().name as string,
            city: (d.data().city as string) || 'Lucknow'
          }));
          fetched.sort((a, b) => a.name.localeCompare(b.name));
          setSchoolsList(fetched);
        } else {
          setSchoolsList(
            SCHOOLS.map(name => ({ name, city: 'Lucknow' }))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      } catch {
        setSchoolsList(
          SCHOOLS.map(name => ({ name, city: 'Lucknow' }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
    };
    fetchSchools();
  }, []);

  // Redirect already-authenticated users
  useEffect(() => {
    if (!loading && user && !isSigningIn && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, isSigningIn, navigate]);

  if (loading) return null;

  // Core Google sign-in logic (shared by form submit + modal callback)
  const triggerGoogleSignIn = async (schoolName: string) => {
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setError('');
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
          localStorage.setItem('pending_school', schoolName);
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }

      const firebaseUser = result.user;
      const docRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        const selectedSchoolData = schoolsList.find(s => s.name === schoolName);
        const userCity = selectedSchoolData?.city || 'Lucknow';

        const batch = writeBatch(db);

        const userData: any = {
          name: firebaseUser.displayName || 'Unknown Student',
          email: firebaseUser.email || '',
          school: schoolName,
          city: userCity,
          verified: false,
          verificationStatus: 'pending',
          reputation: 5.0,
          isAdmin: false,
          profilePicture: firebaseUser.photoURL || null,
          idCardUrl: null,
          selfieUrl: null,
          about: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (referralCode.trim()) {
          try {
            const q = query(
              collection(db, 'users'),
              where('referralCode', '==', referralCode.trim().toUpperCase()),
              limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              const referrerDoc = snap.docs[0];
              userData.referredBy = referrerDoc.id;
              const referralDocRef = doc(db, 'users', referrerDoc.id, 'referrals', firebaseUser.uid);
              batch.set(referralDocRef, { timestamp: serverTimestamp() });
            }
          } catch (refErr) {
            console.error('Failed to apply referral:', refErr);
          }
        }

        batch.set(docRef, userData);
        await batch.commit();
        localStorage.removeItem('pendingReferral');
      }

      navigate('/dashboard');
    } catch (err: any) {
      console.error("Signup Error Details:", err);
      setError(err.message || 'Failed to authenticate');
      setIsSigningIn(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) {
      setError('Please select your school.');
      return;
    }
    await triggerGoogleSignIn(school);
  };

  /**
   * Called by ContactModal after a successful school request submission.
   * Closes the modal, sets the submitted school as selected, then auto-fires sign-in.
   */
  const handleSchoolSubmitted = async (schoolName: string) => {
    setIsModalOpen(false);
    // Use the submitted school name as a temporary stand-in (pending approval)
    setSchool(schoolName);
    // Add it to the local list so it shows as selected in the dropdown
    setSchoolsList(prev => {
      if (prev.some(s => s.name === schoolName)) return prev;
      return [...prev, { name: schoolName, city: 'Pending' }].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });
    await triggerGoogleSignIn(schoolName);
  };

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
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">
                School / Institute
              </label>
              <SchoolDropdown
                value={school}
                onChange={setSchool}
                schools={schoolsList}
              />
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

            <div className="space-y-1.5 mt-4">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">
                Referral Code (Optional)
              </label>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Enter invite code"
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium uppercase"
              />
            </div>

            {/* Terms agreement */}
            <label className="flex items-start gap-3 cursor-pointer group mt-2">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  agreedToTerms
                    ? 'bg-brand-teal border-brand-teal'
                    : 'border-luxury-ink/20 bg-surface-card group-hover:border-brand-teal/50'
                }`}>
                  {agreedToTerms && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs text-luxury-ink/50 leading-relaxed">
                I agree to Nextbench's{' '}
                <Link to="/terms" target="_blank" className="text-brand-teal font-bold hover:text-brand-pink transition-colors">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" target="_blank" className="text-brand-teal font-bold hover:text-brand-pink transition-colors">
                  Privacy Policy
                </Link>, including consent to the collection and processing of my personal data for identity verification as described in the Privacy Policy.
                I confirm I am a currently enrolled student.
              </span>
            </label>

            <button
              type="submit"
              disabled={!agreedToTerms || isSigningIn}
              className="w-full bg-brand-pink text-white py-5 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand-pink/10 hover:bg-brand-teal transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-pink"
            >
              {isSigningIn ? 'Connecting…' : 'Initialize Verification with Google'}
            </button>
          </form>

          <p className="mt-16 text-center text-[11px] font-bold uppercase tracking-widest text-brand-teal/40">
            Already a member?{' '}
            <Link to="/login" className="text-brand-teal hover:text-brand-pink transition-colors">
              Sign In
            </Link>
          </p>

          <div className="mt-6 pt-6 border-t border-luxury-ink/5 text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-3">
              Not a student?
            </p>
            <Link
              to="/org-signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-teal/5 border border-brand-teal/10 rounded-full text-[11px] font-bold uppercase tracking-widest text-brand-teal hover:bg-brand-teal hover:text-white transition-all"
            >
              <Building size={14} />
              Register as Organization
            </Link>
          </div>
        </div>
      </div>

      {/* Right: Brand Asset */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-brand-teal p-20 relative overflow-hidden">
        <div className="relative z-10 text-center max-w-sm">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-white/20">
            <ShieldCheck className="text-brand-mint w-8 h-8" />
          </div>
          <h2 className="text-6xl font-serif italic text-white mb-8 leading-[1.1]">
            Verified <br />Students Only.
          </h2>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest leading-relaxed mb-12">
            Every member is manually vetted to ensure total campus trust.
          </p>
          <div className="grid grid-cols-2 gap-px bg-white/10">
            <div className="p-8 bg-brand-teal">
              <p className="text-3xl font-light text-white mb-2">ID</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Verified</p>
            </div>
            <div className="p-8 bg-brand-teal">
              <p className="text-3xl font-light text-white mb-2">100%</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Trusted</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
      </div>

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSchoolSubmitted={handleSchoolSubmitted}
      />
    </div>
  );
}