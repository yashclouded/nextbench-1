import { motion } from 'motion/react';
import { Camera, IdCard, CheckCircle, ArrowRight, ShieldCheck, UploadCloud, AlertCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import React, { useState, useRef } from 'react';
import { uploadToCloudinary } from '../../lib/storage';
import { useAuth } from '../../lib/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../lib/ToastContext';
import { isHeicFile, convertHeicToJpeg } from '../../lib/heic-converter';

export default function Verification() {
  const [step, setStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isRejected = searchParams.get('rejected') === 'true';
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Already verified → go straight to marketplace
    if (userData?.verified) {
      navigate('/dashboard');
      return;
    }
    // Organization accounts skip ID + selfie steps — their document was uploaded at signup
    if (userData?.accountType === 'organization') {
      setStep(3);
      return;
    }
    // If user already submitted and is pending, jump to step 3 immediately
    if (userData?.verificationStatus === 'pending' && userData?.idCardUrl) {
      setStep(3);
    }
  }, [userData]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      let file = e.target.files[0];
      
      const isHeic = isHeicFile(file);
      const isStandardImage = file.type.startsWith('image/');
      
      if (!isHeic && !isStandardImage) {
        showToast('Please select a valid image file', 'error');
        return;
      }
      
      if (isHeic) {
        showToast('Converting HEIC image...', 'info');
        file = await convertHeicToJpeg(file);
      }
      
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be less than 5MB', 'error');
        return;
      }
      setIdFile(file);
      setIdPreview(URL.createObjectURL(file));
    }
  };

  const handleSelfieChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      let file = e.target.files[0];
      
      const isHeic = isHeicFile(file);
      const isStandardImage = file.type.startsWith('image/');
      
      if (!isHeic && !isStandardImage) {
        showToast('Please select a valid image file', 'error');
        return;
      }
      
      if (isHeic) {
        showToast('Converting HEIC image...', 'info');
        file = await convertHeicToJpeg(file);
      }
      
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be less than 5MB', 'error');
        return;
      }
      setSelfieFile(file);
      setSelfiePreview(URL.createObjectURL(file));
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!idFile) {
        showToast('Please upload an ID image', 'warning');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!user || !idFile || !selfieFile) {
        showToast('Please take a selfie to continue', 'warning');
        return;
      }
      setIsUploading(true);
      try {
        // Force-refresh the Firebase auth token so Firestore security rules
        // see the latest claims (email_verified, etc.) before we write.
        await user.getIdToken(true);

        const [idUrl, selfieUrl] = await Promise.all([
          uploadToCloudinary(idFile, 'ids'),
          uploadToCloudinary(selfieFile, 'ids')
        ]);
        
        await updateDoc(doc(db, 'users', user.uid), {
          idCardUrl: idUrl,
          selfieUrl: selfieUrl,
          verificationStatus: 'pending',
          updatedAt: serverTimestamp()
        });
        setStep(3);
      } catch (error) {
        console.error("Upload error:", error);
        showToast('Failed to upload images. Please try again.', 'error');
      } finally {
        setIsUploading(false);
      }
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-28 pb-20">
      <div className="w-full max-w-xl">
        {isRejected && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl text-center">
            <h3 className="text-red-600 font-bold mb-1">Application Rejected</h3>
            <p className="text-red-500/80 text-xs font-medium">Your previous ID verification was rejected. Please upload a clearer photo of your valid student ID.</p>
          </div>
        )}

        {/* Progress Bar */}
        <div className="flex items-center gap-4 mb-20">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1 h-1.5 rounded-full bg-luxury-ink/5 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: step >= s ? '100%' : '0%' }}
                className="h-full bg-brand-teal"
              />
            </div>
          ))}
        </div>

        <motion.div 
          key={step}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-surface-card rounded-[3rem] p-10 md:p-16 luxury-shadow border border-luxury-ink/5"
        >
          {step === 1 && (
            <div className="text-center">
              <div className="w-20 h-20 bg-brand-teal/10 rounded-3xl flex items-center justify-center mx-auto mb-10">
                <IdCard className="text-brand-teal" size={32} />
              </div>
              <h2 className="text-3xl font-serif font-bold text-luxury-ink mb-6">School ID Verification</h2>
              <p className="text-luxury-ink/50 mb-12 leading-relaxed">
                Take a clear photo of your official student ID card. Ensure your name and photo are clearly visible.
              </p>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative border-2 border-dashed border-luxury-ink/10 rounded-[2rem] p-16 transition-all hover:border-brand-teal hover:bg-brand-teal/5 cursor-pointer mb-12 overflow-hidden"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*,.heic,.heif" 
                  className="hidden" 
                />
                {idPreview ? (
                  <div className="absolute inset-0">
                    <img src={idPreview} alt="ID Preview" className="w-full h-full object-cover opacity-50 group-hover:opacity-30 transition-opacity" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <UploadCloud className="text-brand-teal mb-4 drop-shadow-md" size={48} />
                      <p className="text-xs font-bold uppercase tracking-widest text-brand-teal bg-white/80 px-4 py-2 rounded-full">Change Photo</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center relative z-10">
                    <UploadCloud className="text-luxury-ink/20 group-hover:text-brand-teal transition-colors" size={48} />
                    <p className="mt-4 text-xs font-bold uppercase tracking-widest text-luxury-ink/40">Drop ID Photo or Browse</p>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-4 p-6 bg-surface-soft rounded-2xl mb-12 text-left">
                <AlertCircle className="text-brand-teal shrink-0" size={20} />
                <p className="text-xs font-medium text-luxury-ink/60 leading-relaxed">Your ID is used only for verification and is stored with government-grade encryption. We never share it with anyone.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <div className="w-20 h-20 bg-brand-pink/10 rounded-3xl flex items-center justify-center mx-auto mb-10">
                <Camera className="text-brand-pink" size={32} />
              </div>
              <h2 className="text-3xl font-serif font-bold text-luxury-ink mb-6">Live Selfie Check</h2>
              <p className="text-luxury-ink/50 mb-12 leading-relaxed">
                We need a quick selfie of you holding your ID card to match identity. Smile — you're almost in.
              </p>
              
              <div 
                onClick={() => selfieInputRef.current?.click()}
                className="group relative aspect-[4/3] bg-luxury-ink/5 rounded-[2rem] overflow-hidden flex items-center justify-center mb-12 cursor-pointer border-2 border-dashed border-luxury-ink/10 hover:border-brand-pink transition-all"
              >
                <input 
                  type="file" 
                  ref={selfieInputRef} 
                  onChange={handleSelfieChange} 
                  accept="image/*,.heic,.heif" 
                  capture="user"
                  className="hidden" 
                />
                {selfiePreview ? (
                  <div className="absolute inset-0">
                    <img src={selfiePreview} alt="Selfie Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-luxury-ink/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                      <p className="text-xs font-bold uppercase tracking-widest text-white bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">Retake Selfie</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-48 h-48 border-4 border-luxury-ink/10 rounded-full border-dashed animate-[spin_10s_linear_infinite]" />
                    <Camera size={40} className="absolute text-luxury-ink/20 group-hover:text-brand-pink transition-colors" />
                    <p className="absolute bottom-10 text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 group-hover:text-brand-pink transition-colors">Tap to Open Camera</p>
                  </>
                )}
              </div>

              <button 
                onClick={() => selfieInputRef.current?.click()}
                className="flex items-center justify-center gap-2 text-brand-pink font-bold hover:scale-105 transition-all mx-auto mb-8"
              >
                <Camera size={18} /> {selfiePreview ? 'Retake Photo' : 'Open Camera'}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-24 h-24 bg-brand-teal rounded-full flex items-center justify-center mx-auto mb-10 luxury-shadow shadow-brand-teal/40"
              >
                <CheckCircle className="text-white" size={40} />
              </motion.div>
              <h2 className="text-3xl font-serif font-bold text-luxury-ink mb-6 italic">Submission <span className="not-italic">Complete.</span></h2>
              <p className="text-luxury-ink/50 mb-12 leading-relaxed text-lg">
                {userData?.accountType === 'organization'
                  ? <>Your organization documents have been submitted for admin review. This usually takes <span className="text-brand-teal font-bold">24-48 hours</span> during business days.</>
                  : <>Your credentials have been submitted for manual approval. This usually takes <span className="text-brand-teal font-bold">2-4 hours</span> during business days.</>
                }
              </p>
              
              <div className="p-8 bg-brand-teal/5 rounded-3xl mb-12">
                <div className="flex items-center gap-2 mb-2 justify-center">
                  <ShieldCheck className="text-brand-teal" size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest text-brand-teal">Application Pending</span>
                </div>
                <p className="text-sm font-medium text-luxury-ink/40 italic">Ref ID: NB-2026-XQ97</p>
              </div>
            </div>
          )}

          <button 
            onClick={handleNext}
            disabled={isUploading}
            className={`w-full py-6 rounded-full font-bold text-lg transition-all flex items-center justify-center gap-3 ${
              isUploading 
                ? 'bg-luxury-ink/10 text-luxury-ink/20 cursor-not-allowed' 
                : 'bg-luxury-ink text-surface-base hover:bg-brand-teal active:scale-95 luxury-shadow'
            }`}
          >
            {isUploading ? 'Securing Document...' : step === 3 ? 'Go to Marketplace' : 'Confirm & Upload'}
            {!isUploading && step < 3 && <ArrowRight size={20} />}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
