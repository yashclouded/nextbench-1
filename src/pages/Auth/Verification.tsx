import { motion } from 'motion/react';
import { Camera, IdCard, CheckCircle, ArrowRight, ShieldCheck, UploadCloud, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Verification() {
  const [step, setStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();

  const handleNext = () => {
    if (step < 3) {
      setIsUploading(true);
      setTimeout(() => {
        setIsUploading(false);
        setStep(step + 1);
      }, 1500);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-28 pb-20">
      <div className="w-full max-w-xl">
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
          className="bg-white rounded-[3rem] p-10 md:p-16 luxury-shadow border border-luxury-ink/5"
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
              
              <div className="group relative border-2 border-dashed border-luxury-ink/10 rounded-[2rem] p-16 transition-all hover:border-brand-teal hover:bg-brand-teal/5 cursor-pointer mb-12">
                <div className="flex flex-col items-center">
                  <UploadCloud className="text-luxury-ink/20 group-hover:text-brand-teal transition-colors" size={48} />
                  <p className="mt-4 text-xs font-bold uppercase tracking-widest text-luxury-ink/40">Drop ID Photo or Browse</p>
                </div>
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
              
              <div className="aspect-[4/3] bg-luxury-ink/5 rounded-[2rem] overflow-hidden relative flex items-center justify-center mb-12">
                 <div className="w-48 h-48 border-4 border-white/50 rounded-full border-dashed animate-[spin_10s_linear_infinite]" />
                 <Camera size={40} className="absolute text-luxury-ink/20" />
                 <p className="absolute bottom-10 text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">Camera Preview</p>
              </div>

              <button className="flex items-center justify-center gap-2 text-brand-pink font-bold hover:scale-105 transition-all mx-auto mb-8">
                <Camera size={18} /> Open Camera
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
                Your credentials have been submitted for manual approval. This usually takes <span className="text-brand-teal font-bold">2-4 hours</span> during business days.
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
                : 'bg-luxury-ink text-white hover:bg-brand-teal active:scale-95 luxury-shadow'
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
