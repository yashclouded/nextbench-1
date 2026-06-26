import { motion, AnimatePresence } from 'motion/react';
import { Building, ShieldCheck, X, Search, ChevronDown, Mail, ArrowLeft, RotateCcw, KeyRound, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth, db, functions } from '../../lib/firebase';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider, signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
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

// ─── Searchable School Dropdown ───────────────────────────────────────────────
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 bg-surface-card border border-brand-teal/10 rounded-sm shadow-xl overflow-hidden"
          >
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
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-6 py-4 text-xs text-luxury-ink/30 font-bold uppercase tracking-widest">No results</p>
              ) : (
                filtered.map(s => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => handleSelect(s.name)}
                    className={`w-full text-left px-6 py-3 text-sm font-medium transition-colors hover:bg-brand-teal/5 ${s.name === value ? 'text-brand-teal bg-brand-teal/5' : 'text-luxury-ink'}`}
                  >
                    {s.name}
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">{s.city}</span>
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
  onSchoolSubmitted: (schoolName: string) => void;
}

function ContactModal({ isOpen, onClose, onSchoolSubmitted }: ContactModalProps) {
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!idCardFile) { setResult("Please upload an ID card."); return; }
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
      await addDoc(collection(db, 'school_requests'), { schoolName, city, website, requesterName, requesterEmail, idCardUrl, status: 'pending', createdAt: serverTimestamp() });
      setResult("Request submitted! Starting verification…");
      setTimeout(() => onSchoolSubmitted(schoolName), 1200);
    } catch {
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
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-luxury-ink/40 hover:text-luxury-ink transition-colors"><X size={20} /></button>
          <h3 className="text-xl font-bold text-luxury-ink mb-2">Request School Addition</h3>
          <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/40 mb-8">Tell us about your campus.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            {[
              { label: 'Your Name', name: 'requesterName', type: 'text' },
              { label: 'Your Email', name: 'requesterEmail', type: 'email' },
              { label: 'School Name', name: 'schoolName', type: 'text' },
              { label: 'City', name: 'city', type: 'text', placeholder: 'e.g., Lucknow' },
              { label: 'School Website', name: 'website', type: 'url', placeholder: 'https://' },
            ].map(f => (
              <div key={f.name} className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">{f.label}</label>
                <input type={f.type} name={f.name} required placeholder={f.placeholder} className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-3 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium" />
              </div>
            ))}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Student ID Card (Image)</label>
              <input type="file" accept="image/*" required onChange={(e) => setIdCardFile(e.target.files?.[0] || null)} className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-3 px-6 text-sm font-medium file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-xs file:font-bold file:bg-brand-teal/10 file:text-brand-teal hover:file:bg-brand-teal/20" />
            </div>
            <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-brand-teal text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg shadow-brand-teal/20 hover:bg-brand-pink transition-colors disabled:opacity-50 mt-4">
              {isSubmitting ? "Submitting…" : "Submit & Continue"}
            </button>
            {result && <p className={`text-center text-xs font-bold tracking-widest uppercase mt-4 ${result.includes('submitted') ? 'text-brand-mint' : 'text-red-500'}`}>{result}</p>}
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── OTP Input Component ─────────────────────────────────────────────────────
function OtpInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKeyDown = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handleChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(-1);
    const arr = value.split('');
    arr[i] = v;
    const next = arr.join('').padEnd(6, '').slice(0, 6);
    onChange(next);
    if (v && i < 5) inputs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) { onChange(pasted.padEnd(6, '').slice(0, 6)); inputs.current[Math.min(pasted.length, 5)]?.focus(); }
    e.preventDefault();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={handleChange(i)}
          onKeyDown={handleKeyDown(i)}
          onPaste={handlePaste}
          disabled={disabled}
          className="w-10 h-12 text-center text-xl font-bold border border-luxury-ink/15 rounded-xl bg-surface-base focus:outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20 transition-all disabled:opacity-50 text-luxury-ink"
        />
      ))}
    </div>
  );
}

// ─── Countdown ────────────────────────────────────────────────────────────────
function Countdown({ seconds, onEnd }: { seconds: number; onEnd: () => void }) {
  const [left, setLeft] = useState(seconds);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  useEffect(() => {
    setLeft(seconds);
    const id = setInterval(() => setLeft(s => { if (s <= 1) { clearInterval(id); onEndRef.current(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return <span className="tabular-nums text-brand-teal font-bold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>;
}

// ─── Terms Label ─────────────────────────────────────────────────────────────
function TermsLabel({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${checked ? 'bg-brand-teal border-brand-teal' : 'border-luxury-ink/20 bg-surface-card group-hover:border-brand-teal/50'}`}>
          {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </div>
      </div>
      <span className="text-xs text-luxury-ink/50 leading-relaxed">
        I agree to Nextbench's{' '}
        <Link to="/terms" target="_blank" className="text-brand-teal font-bold hover:text-brand-pink transition-colors">Terms of Service</Link>
        {' '}and{' '}
        <Link to="/privacy" target="_blank" className="text-brand-teal font-bold hover:text-brand-pink transition-colors">Privacy Policy</Link>
        , including consent to the collection and processing of my personal data for identity verification. I confirm I am a currently enrolled student.
      </span>
    </label>
  );
}

// ─── Main Signup Page ─────────────────────────────────────────────────────────
type SignupStep = 'details' | 'otp';

export default function Signup() {
  const [signupStep, setSignupStep] = useState<SignupStep>('details');

  // Shared state
  const [school, setSchool] = useState('');
  const [schoolsList, setSchoolsList] = useState<{ name: string; city: string }[]>([]);
  const [referralCode, setReferralCode] = useState(localStorage.getItem('pendingReferral') || '');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Email OTP state
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [otp, setOtp] = useState('');
  const [canResend, setCanResend] = useState(false);
  const [resendKey, setResendKey] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const redirectedRef = useRef(false);

  // Fetch schools
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const snap = await getDocs(collection(db, 'schools'));
        if (!snap.empty) {
          const fetched = snap.docs.map(d => ({ name: d.data().name as string, city: (d.data().city as string) || 'Lucknow' }));
          fetched.sort((a, b) => a.name.localeCompare(b.name));
          setSchoolsList(fetched);
        } else {
          setSchoolsList(SCHOOLS.map(name => ({ name, city: 'Lucknow' })).sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        setSchoolsList(SCHOOLS.map(name => ({ name, city: 'Lucknow' })).sort((a, b) => a.name.localeCompare(b.name)));
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

  // ── Google OAuth Signup ───────────────────────────────────────────────────
  const triggerGoogleSignIn = async (schoolName: string) => {
    if (!agreedToTerms) { setError('Please agree to the Terms of Service and Privacy Policy.'); return; }
    setError('');
    setIsSigningIn(true);

    const provider = new GoogleAuthProvider();
    try {
      let result;
      try {
        result = await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
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
            const q = query(collection(db, 'users'), where('referralCode', '==', referralCode.trim().toUpperCase()), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const referrerDoc = snap.docs[0];
              userData.referredBy = referrerDoc.id;
              batch.set(doc(db, 'users', referrerDoc.id, 'referrals', firebaseUser.uid), { timestamp: serverTimestamp() });
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
      console.error("Signup Error:", err);
      setError(err.message || 'Failed to authenticate');
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (!school) { setError('Please select your school.'); return; }
    await triggerGoogleSignIn(school);
  };

  const handleSchoolSubmitted = async (schoolName: string) => {
    setIsModalOpen(false);
    setSchool(schoolName);
    setSchoolsList(prev => {
      if (prev.some(s => s.name === schoolName)) return prev;
      return [...prev, { name: schoolName, city: 'Pending' }].sort((a, b) => a.name.localeCompare(b.name));
    });
    await triggerGoogleSignIn(schoolName);
  };

  // ── Email OTP Signup ──────────────────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!school) { setError('Please select your school first.'); return; }
    if (!agreedToTerms) { setError('Please agree to the Terms of Service and Privacy Policy.'); return; }
    if (!nameInput.trim()) { setError('Please enter your full name.'); return; }
    if (!emailInput.trim()) { setError('Please enter your email address.'); return; }

    setError('');
    setIsSendingOtp(true);
    try {
      const sendFn = httpsCallable(functions, 'sendAuthOtpEmail');
      await sendFn({ email: emailInput.trim().toLowerCase() });
      setOtp('');
      setCanResend(false);
      setResendKey(k => k + 1);
      setSignupStep('otp');
    } catch (err: any) {
      const msg = err?.details?.message || err?.message || 'Failed to send OTP.';
      setError(msg.replace('Error: ', ''));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otp.replace(/\D/g, '').length < 6) return;
    setError('');
    setIsSigningIn(true);

    try {
      const selectedSchoolData = schoolsList.find(s => s.name === school);
      const verifyFn = httpsCallable(functions, 'verifyAuthOtpEmail');
      const result: any = await verifyFn({
        email: emailInput.trim().toLowerCase(),
        otp,
        isSignup: true,
        signupData: {
          school,
          city: selectedSchoolData?.city || 'Lucknow',
          referralCode: referralCode.trim(),
          name: nameInput.trim(),
        },
      });

      if (!result.data?.loginPassword || !result.data?.email) throw new Error('Authentication failed.');
      await signInWithEmailAndPassword(auth, result.data.email, result.data.loginPassword);
      localStorage.removeItem('pendingReferral');
      navigate('/dashboard');
    } catch (err: any) {
      const raw = err?.details?.message || err?.message || 'Verification failed.';
      setError(raw.replace('Error: ', ''));
      setIsSigningIn(false);
    }
  };

  const handleOtpChange = useCallback((val: string) => {
    setOtp(val);
    if (val.replace(/\D/g, '').length === 6 && !isSigningIn) {
      setTimeout(() => handleVerifyOtp(), 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSigningIn]);

  // ── Shared UI blocks ──────────────────────────────────────────────────────
  const SharedSchoolFields = (
    <>
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">School / Institute</label>
        <SchoolDropdown value={school} onChange={setSchool} schools={schoolsList} />
      </div>
      <div className="flex justify-start px-1">
        <button type="button" onClick={() => setIsModalOpen(true)} className="text-[10px] font-bold uppercase tracking-widest text-brand-teal hover:text-brand-pink transition-colors">
          Not your school here?
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 pt-20 bg-surface-base">
      {/* Left: Form */}
      <div className="flex items-center justify-center px-8 py-20">
        <div className="w-full max-w-sm">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
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

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-brand-pink/10 text-brand-pink text-xs font-bold uppercase tracking-widest text-center border border-brand-pink/20 rounded-sm">
                  {error === "INTERNAL" ? "Server Error: Could not connect to verification service" : error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form content */}
          <AnimatePresence mode="wait" initial={false}>
            {/* Step 1: Details */}
            {signupStep === 'details' && (
              <motion.form
                key="email-form"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSendOtp}
                className="space-y-5"
              >
                {SharedSchoolFields}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Full Name</label>
                  <div className="relative">
                    <User size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/30 pointer-events-none" />
                    <input
                      type="text"
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      placeholder="Jane Doe"
                      required
                      autoComplete="name"
                      className="w-full bg-surface-base border border-luxury-ink/10 rounded-sm py-4 pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-brand-teal transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/30 pointer-events-none" />
                    <input
                      type="email"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      placeholder="your@email.com"
                      required
                      autoComplete="email"
                      className="w-full bg-surface-base border border-luxury-ink/10 rounded-sm py-4 pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-brand-teal transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Referral Code (Optional)</label>
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="Enter invite code"
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-sm py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium uppercase"
                  />
                </div>
                <TermsLabel checked={agreedToTerms} onChange={setAgreedToTerms} />
                
                <button
                  type="submit"
                  disabled={!agreedToTerms || isSendingOtp || !emailInput}
                  className="w-full bg-brand-pink text-white py-5 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand-pink/10 hover:bg-brand-teal transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <KeyRound size={15} />
                  {isSendingOtp ? 'Sending Code…' : 'Send Verification Code'}
                </button>

                {/* Divider */}
                <div className="relative py-4 flex items-center">
                  <div className="grow border-t border-luxury-ink/10" />
                  <span className="shrink-0 mx-4 text-luxury-ink/30 text-[10px] font-bold uppercase tracking-widest">
                    Or
                  </span>
                  <div className="grow border-t border-luxury-ink/10" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignup}
                  disabled={!agreedToTerms || isSigningIn}
                  className="w-full bg-transparent border border-luxury-ink/20 text-luxury-ink py-4 rounded-sm font-bold text-xs uppercase tracking-[0.2em] hover:bg-luxury-ink/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
                >
                  <ShieldCheck size={16} className="text-luxury-ink/60 group-hover:text-luxury-ink transition-colors" />
                  {isSigningIn ? 'Connecting…' : 'Continue with Google'}
                </button>
              </motion.form>
            )}

            {/* Step 2: Enter OTP */}
            {signupStep === 'otp' && (
              <motion.div
                key="otp-step"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-6"
              >
                <div className="text-center">
                  <div className="w-14 h-14 bg-brand-teal/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail size={24} className="text-brand-teal" />
                  </div>
                  <p className="text-luxury-ink/70 text-sm leading-relaxed">We've sent a 6-digit code to</p>
                  <p className="text-luxury-ink font-bold text-sm mt-1">{emailInput}</p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <OtpInput value={otp} onChange={handleOtpChange} disabled={isSigningIn} />
                  <button
                    type="submit"
                    disabled={isSigningIn || otp.replace(/\D/g, '').length < 6}
                    className="w-full bg-brand-teal text-white py-4 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-teal/15 hover:bg-luxury-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <ShieldCheck size={14} />
                    {isSigningIn ? 'Creating Account…' : 'Verify & Create Account'}
                  </button>
                </form>

                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
                  <button onClick={() => { setSignupStep('details'); setOtp(''); setError(''); }} className="flex items-center gap-1.5 text-luxury-ink/40 hover:text-luxury-ink transition-colors">
                    <ArrowLeft size={12} />
                    Change email
                  </button>
                  {canResend ? (
                    <button onClick={() => handleSendOtp()} disabled={isSendingOtp} className="flex items-center gap-1.5 text-brand-teal hover:text-brand-pink transition-colors disabled:opacity-50">
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

          <p className="mt-10 text-center text-[11px] font-bold uppercase tracking-widest text-brand-teal/40">
            Already a member?{' '}
            <Link to="/login" className="text-brand-teal hover:text-brand-pink transition-colors">Sign In</Link>
          </p>

          <div className="mt-6 pt-6 border-t border-luxury-ink/5 text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-3">Not a student?</p>
            <Link to="/org-signup" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-teal/5 border border-brand-teal/10 rounded-full text-[11px] font-bold uppercase tracking-widest text-brand-teal hover:bg-brand-teal hover:text-white transition-all">
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