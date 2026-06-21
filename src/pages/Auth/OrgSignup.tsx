import { motion, AnimatePresence } from 'motion/react';
import { Building2, Globe, FileText, ArrowRight, ArrowLeft, ShieldCheck, Upload, GraduationCap, BookOpen, Users, Briefcase, HelpCircle, CheckCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { auth, db, functions } from '../../lib/firebase';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, limit, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../lib/AuthContext';
import { uploadOrgDocument } from '../../lib/storage';
import { useToast } from '../../lib/ToastContext';

const ORG_TYPES = [
  { id: 'company' as const, label: 'Company / Business', icon: Briefcase, desc: 'Registered businesses, startups, or enterprises', docHint: 'GSTIN certificate or business registration' },
  { id: 'school' as const, label: 'School / College', icon: GraduationCap, desc: 'Educational institutions from K-12 to universities', docHint: 'UDISE code proof or affiliation certificate' },
  { id: 'coaching' as const, label: 'Coaching Centre', icon: BookOpen, desc: 'Tutoring centres, coaching institutes, or training academies', docHint: 'Registration certificate or trade license' },
  { id: 'ngo' as const, label: 'NGO / Club / Society', icon: Users, desc: 'Non-profits, student clubs, or registered societies', docHint: 'Trust deed, society registration, or 12A/80G certificate' },
  { id: 'other' as const, label: 'Other', icon: HelpCircle, desc: 'Event organizers, freelancers, or anything else', docHint: 'Any official registration or identity document' },
];

type OrgTypeId = typeof ORG_TYPES[number]['id'];

export default function OrgSignup() {
  const [step, setStep] = useState(1);
  const [orgType, setOrgType] = useState<OrgTypeId | ''>('');
  const [orgName, setOrgName] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');
  const [orgCity, setOrgCity] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [referralCode, setReferralCode] = useState(localStorage.getItem('pendingReferral') || '');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const redirectedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect already-authenticated users
  useEffect(() => {
    if (!loading && user && !isSigningIn && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, isSigningIn, navigate]);

  if (loading) return null;

  const selectedOrgType = ORG_TYPES.find(t => t.id === orgType);

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Accept images and PDFs
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(file.type) && !file.type.startsWith('image/')) {
        showToast('Please upload an image or PDF file', 'error');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast('File must be less than 10MB', 'error');
        return;
      }
      setDocFile(file);
      if (file.type.startsWith('image/')) {
        setDocPreview(URL.createObjectURL(file));
      } else {
        setDocPreview(null); // PDF — no preview
      }
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!orgType) {
        setError('Please select your organization type.');
        return;
      }
      setError('');
      setStep(2);
    } else if (step === 2) {
      if (!orgName.trim()) {
        setError('Please enter your organization name.');
        return;
      }
      if (!orgCity.trim()) {
        setError('Please enter your city.');
        return;
      }
      setError('');
      setStep(3);
    } else if (step === 3) {
      if (!docFile) {
        setError('Please upload a verification document.');
        return;
      }
      setError('');
      setStep(4);
    }
  };

  const handlePrevStep = () => {
    setError('');
    setStep(s => Math.max(1, s - 1));
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }
    if (!docFile || !orgType || !orgName.trim() || !orgCity.trim()) {
      setError('Please complete all steps before signing up.');
      return;
    }

    setIsSigningIn(true);
    setIsUploading(true);
    const provider = new GoogleAuthProvider();

    try {
      // Upload document first
      showToast('Uploading organization document...', 'info');
      const docUrl = await uploadOrgDocument(docFile);

      // Google Sign In
      let result;
      try {
        result = await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          // Store state for redirect flow
          localStorage.setItem('pending_org_signup', JSON.stringify({
            orgType, orgName, orgWebsite, orgCity, orgDescription, docUrl
          }));
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }

      const firebaseUser = result.user;

      // Check if user already exists
      const docRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        const batch = writeBatch(db);

        const userData: any = {
          name: orgName.trim(),
          email: firebaseUser.email || '',
          school: orgName.trim(), // reuse school field as org identifier for compatibility
          city: orgCity.trim(),
          verified: false,
          verificationStatus: 'pending',
          reputation: 5.0,
          isAdmin: false,
          profilePicture: firebaseUser.photoURL || null,
          idCardUrl: null,
          selfieUrl: null,
          about: orgDescription.trim() || null,
          // Organization-specific fields
          accountType: 'organization',
          orgName: orgName.trim(),
          orgType: orgType,
          orgDocumentUrl: docUrl,
          orgWebsite: orgWebsite.trim() || null,
          orgDescription: orgDescription.trim() || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        // Apply referral if code is provided
        if (referralCode.trim()) {
          try {
            const q = query(collection(db, 'users'), where('referralCode', '==', referralCode.trim().toUpperCase()), limit(1));
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

        showToast('Organization registered! Pending admin verification.', 'success');
        navigate('/dashboard');
      } else {
        // Already exists
        showToast('This Google account already has a Nextbench profile.', 'info');
        navigate('/dashboard');
      }
    } catch (err: any) {
      console.error("Org Signup Error:", err);
      setError(err.message || 'Failed to authenticate');
      setIsSigningIn(false);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 pt-20 bg-surface-base">
      {/* Left: Form */}
      <div className="flex items-center justify-center px-8 py-20">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <div className="inline-block px-3 py-1 bg-brand-teal/10 text-brand-teal text-[11px] font-bold uppercase tracking-[0.2em] mb-8 rounded-full">
              Organization Registration
            </div>
            <h1 className="text-4xl md:text-5xl font-light text-luxury-ink mb-4 leading-tight">
              Grow with <span className="italic font-serif text-brand-pink-soft">Nextbench</span>.
            </h1>
            <p className="text-brand-teal/50 text-xs font-bold uppercase tracking-widest leading-relaxed">
              Sell, post events & connect with students.
            </p>
          </motion.div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-10">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex-1 h-1.5 rounded-full bg-luxury-ink/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: step >= s ? '100%' : '0%' }}
                  transition={{ duration: 0.4 }}
                  className="h-full bg-brand-teal"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-xs font-bold uppercase tracking-widest text-center border border-red-100 rounded-sm">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Step 1: Choose Org Type */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-lg font-bold text-luxury-ink mb-2">What type of organization?</h2>
                <p className="text-xs text-luxury-ink/40 mb-6">Select the category that best describes you.</p>

                <div className="space-y-3">
                  {ORG_TYPES.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => { setOrgType(type.id); setError(''); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left group ${
                        orgType === type.id
                          ? 'border-brand-teal bg-brand-teal/5 shadow-md shadow-brand-teal/10'
                          : 'border-luxury-ink/5 hover:border-brand-teal/30 bg-surface-card'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        orgType === type.id
                          ? 'bg-brand-teal text-white'
                          : 'bg-luxury-ink/5 text-luxury-ink/30 group-hover:bg-brand-teal/10 group-hover:text-brand-teal'
                      }`}>
                        <type.icon size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-luxury-ink">{type.label}</p>
                        <p className="text-[11px] text-luxury-ink/40 truncate">{type.desc}</p>
                      </div>
                      {orgType === type.id && (
                        <CheckCircle size={20} className="text-brand-teal shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Org Details */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <h2 className="text-lg font-bold text-luxury-ink mb-2">Organization Details</h2>
                <p className="text-xs text-luxury-ink/40 mb-6">Tell us about your {selectedOrgType?.label?.toLowerCase() || 'organization'}.</p>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Organization Name *</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g., Lucknow Public School"
                    required
                    maxLength={100}
                    className="w-full bg-surface-card border border-brand-teal/10 rounded-sm py-4 px-6 shadow-sm focus:outline-none focus:border-brand-pink transition-all text-sm font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">City *</label>
                  <input
                    type="text"
                    value={orgCity}
                    onChange={(e) => setOrgCity(e.target.value)}
                    placeholder="e.g., Lucknow"
                    required
                    maxLength={100}
                    className="w-full bg-surface-card border border-brand-teal/10 rounded-sm py-4 px-6 shadow-sm focus:outline-none focus:border-brand-pink transition-all text-sm font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Website (Optional)</label>
                  <input
                    type="url"
                    value={orgWebsite}
                    onChange={(e) => setOrgWebsite(e.target.value)}
                    placeholder="https://"
                    className="w-full bg-surface-card border border-brand-teal/10 rounded-sm py-4 px-6 shadow-sm focus:outline-none focus:border-brand-pink transition-all text-sm font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Description (Optional)</label>
                  <textarea
                    value={orgDescription}
                    onChange={(e) => setOrgDescription(e.target.value)}
                    placeholder="Briefly describe what your organization does..."
                    rows={3}
                    maxLength={600}
                    className="w-full bg-surface-card border border-brand-teal/10 rounded-sm py-4 px-6 shadow-sm focus:outline-none focus:border-brand-pink transition-all text-sm font-medium resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Referral Code (Optional)</label>
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="Enter invite code"
                    className="w-full bg-surface-card border border-brand-teal/10 rounded-sm py-4 px-6 shadow-sm focus:outline-none focus:border-brand-pink transition-all text-sm font-medium uppercase"
                  />
                </div>
              </motion.div>
            )}

            {/* Step 3: Upload Document */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <h2 className="text-lg font-bold text-luxury-ink mb-2">Verification Document</h2>
                <p className="text-xs text-luxury-ink/40 mb-2">
                  Upload your official registration document to verify your organization.
                </p>
                {selectedOrgType && (
                  <div className="flex items-start gap-3 p-4 bg-brand-teal/5 rounded-xl border border-brand-teal/10 mb-6">
                    <FileText size={16} className="text-brand-teal shrink-0 mt-0.5" />
                    <p className="text-[11px] font-medium text-brand-teal/80">
                      <span className="font-bold">Recommended:</span> {selectedOrgType.docHint}
                    </p>
                  </div>
                )}

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative border-2 border-dashed border-luxury-ink/10 rounded-2xl p-12 transition-all hover:border-brand-teal hover:bg-brand-teal/5 cursor-pointer overflow-hidden"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleDocChange}
                    accept="image/*,.pdf"
                    className="hidden"
                  />
                  {docPreview ? (
                    <div className="flex flex-col items-center">
                      <img src={docPreview} alt="Document preview" className="max-h-40 rounded-xl mb-4 shadow-md" />
                      <p className="text-xs font-bold uppercase tracking-widest text-brand-teal">Change Document</p>
                    </div>
                  ) : docFile ? (
                    <div className="flex flex-col items-center">
                      <FileText size={48} className="text-brand-teal mb-4" />
                      <p className="text-sm font-bold text-luxury-ink mb-1">{docFile.name}</p>
                      <p className="text-xs font-bold uppercase tracking-widest text-brand-teal">Change Document</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload className="text-luxury-ink/20 group-hover:text-brand-teal transition-colors" size={48} />
                      <p className="mt-4 text-xs font-bold uppercase tracking-widest text-luxury-ink/40">
                        Drop document or Browse
                      </p>
                      <p className="mt-2 text-[10px] text-luxury-ink/30">
                        JPG, PNG, PDF • Max 10MB
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 4: Terms & Sign In */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-lg font-bold text-luxury-ink mb-6">Almost there!</h2>

                {/* Summary */}
                <div className="bg-surface-card border border-luxury-ink/5 rounded-2xl p-5 mb-6 space-y-3">
                  <div className="flex items-center gap-3">
                    {selectedOrgType && <selectedOrgType.icon size={18} className="text-brand-teal" />}
                    <div>
                      <p className="text-sm font-bold text-luxury-ink">{orgName}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">
                        {selectedOrgType?.label} • {orgCity}
                      </p>
                    </div>
                  </div>
                  {orgWebsite && (
                    <p className="text-xs text-brand-teal flex items-center gap-1.5">
                      <Globe size={12} /> {orgWebsite}
                    </p>
                  )}
                  {docFile && (
                    <p className="text-xs text-luxury-ink/40 flex items-center gap-1.5">
                      <FileText size={12} /> {docFile.name}
                    </p>
                  )}
                </div>

                <form onSubmit={handleSignup} className="space-y-6">
                  {/* Terms agreement */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative mt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        agreedToTerms ? 'bg-brand-teal border-brand-teal' : 'border-luxury-ink/20 bg-surface-card group-hover:border-brand-teal/50'
                      }`}>
                        {agreedToTerms && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>
                    <span className="text-xs text-luxury-ink/50 leading-relaxed">
                      I agree to Nextbench's{' '}
                      <Link to="/terms" target="_blank" className="text-brand-teal font-bold hover:text-brand-pink transition-colors">Terms of Service</Link>{' '}
                      and{' '}
                      <Link to="/privacy" target="_blank" className="text-brand-teal font-bold hover:text-brand-pink transition-colors">Privacy Policy</Link>, including consent to the collection and processing of my organization's data for identity verification as described in the Privacy Policy.
                      I confirm I am an authorized representative of this organization.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={!agreedToTerms || isSigningIn}
                    className="w-full bg-brand-pink text-white py-5 rounded-sm font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand-pink/10 hover:bg-brand-teal transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-pink"
                  >
                    {isUploading ? 'Uploading Document...' : isSigningIn ? 'Signing In...' : 'Register with Google'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-luxury-ink/40 hover:text-brand-teal transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>
            ) : <div />}

            {step < 4 && (
              <button
                type="button"
                onClick={handleNextStep}
                className="flex items-center gap-2 px-6 py-3 bg-luxury-ink text-surface-base text-[11px] font-bold uppercase tracking-[0.2em] rounded-sm hover:bg-brand-teal transition-all"
              >
                Continue <ArrowRight size={14} />
              </button>
            )}
          </div>

          <div className="mt-12 text-center space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-teal/40">
              Are you a student? <Link to="/signup" className="text-brand-teal hover:text-brand-pink transition-colors">Sign Up Here</Link>
            </p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-teal/40">
              Already a member? <Link to="/login" className="text-brand-teal hover:text-brand-pink transition-colors">Sign In</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right: Brand Panel */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-brand-teal p-20 relative overflow-hidden">
        <div className="relative z-10 text-center max-w-sm">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-white/20">
            <Building2 className="text-brand-mint w-8 h-8" />
          </div>
          <h2 className="text-5xl font-serif italic text-white mb-8 leading-[1.1]">Trusted <br />Organizations.</h2>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest leading-relaxed mb-12">
            Sell products in bulk, promote your events, and reach the verified student community.
          </p>
          <div className="grid grid-cols-3 gap-px bg-white/10">
            <div className="p-6 bg-brand-teal">
              <p className="text-2xl font-light text-white mb-2">📦</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Bulk Sell</p>
            </div>
            <div className="p-6 bg-brand-teal">
              <p className="text-2xl font-light text-white mb-2">📅</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Events</p>
            </div>
            <div className="p-6 bg-brand-teal">
              <p className="text-2xl font-light text-white mb-2">🎯</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Reach</p>
            </div>
          </div>
        </div>

        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
      </div>
    </div>
  );
}
