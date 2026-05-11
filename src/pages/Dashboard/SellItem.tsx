import { motion } from 'motion/react';
import { MapPin, Truck, ChevronRight, Sparkles, ShieldCheck, Upload, Image as ImageIcon, X, Link as LinkIcon } from 'lucide-react';
import React, { useState } from 'react';
import { categories } from '../../mockData';
import { useAuth } from '../../lib/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../lib/ToastContext';
import { uploadProductImage } from '../../lib/storage';

export default function SellItem() {
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadMode, setUploadMode] = useState<'upload' | 'url'>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    price: '',
    category: 'Books',
    condition: 'Like New',
    description: '',
    image: '',
    meetup: true,
    delivery: false
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'warning');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'warning');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData) { showToast('Must be logged in.', 'warning'); return; }
    if (!userData.verified && !userData.isAdmin) { showToast('Only verified users can sell items.', 'warning'); return; }

    let imageUrl = formData.image;

    if (uploadMode === 'upload') {
      if (!imageFile) { showToast('Please select an image.', 'warning'); return; }
    } else {
      if (!imageUrl) { showToast('Please enter an image URL.', 'warning'); return; }
    }

    setIsSubmitting(true);
    try {
      if (uploadMode === 'upload' && imageFile) {
        showToast('Uploading image...', 'info');
        imageUrl = await uploadProductImage(imageFile, user.uid);
      }

      await addDoc(collection(db, 'products'), {
        sellerId: user.uid,
        sellerName: userData.name,
        sellerSchool: userData.school,
        title: formData.title,
        price: Number(formData.price),
        condition: formData.condition,
        category: formData.category,
        image: imageUrl,
        description: formData.description,
        meetupAvailable: formData.meetup,
        deliveryAvailable: formData.delivery,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      showToast('Listing submitted for admin review!', 'success');
      navigate('/marketplace');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'products');
      showToast('Failed to create listing', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
        {/* Left: Form */}
        <div className="space-y-10">
          <div>
            <h1 className="text-5xl font-serif font-bold text-luxury-ink mb-4 italic">List Your <span className="not-italic">Asset.</span></h1>
            <p className="text-luxury-ink/50 font-medium">Create a premium listing for the NextBench community.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Image upload section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Product Image</label>
                <div className="flex bg-surface-base rounded-lg p-0.5 ml-auto">
                  <button type="button" onClick={() => setUploadMode('upload')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${uploadMode === 'upload' ? 'bg-white text-brand-teal shadow-sm' : 'text-luxury-ink/30'}`}>
                    Upload
                  </button>
                  <button type="button" onClick={() => setUploadMode('url')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${uploadMode === 'url' ? 'bg-white text-brand-teal shadow-sm' : 'text-luxury-ink/30'}`}>
                    URL
                  </button>
                </div>
              </div>

              {uploadMode === 'upload' ? (
                <div className="relative">
                  {imagePreview ? (
                    <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-luxury-ink/5 border border-brand-teal/10">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <button type="button" onClick={clearImage} className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-md hover:bg-red-50 hover:text-red-500 transition-all">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="group relative border-2 border-dashed border-luxury-ink/10 rounded-2xl p-12 transition-all hover:border-brand-teal hover:bg-brand-teal/5 cursor-pointer block">
                      <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                      <div className="flex flex-col items-center">
                        <Upload className="text-luxury-ink/20 group-hover:text-brand-teal transition-colors" size={40} />
                        <p className="mt-3 text-xs font-bold uppercase tracking-widest text-luxury-ink/40">Drop image or click to browse</p>
                        <p className="mt-1 text-[10px] text-luxury-ink/20">Max 5MB • JPG, PNG, WebP</p>
                      </div>
                    </label>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <LinkIcon size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-luxury-ink/30" />
                  <input type="url" value={formData.image} onChange={(e) => setFormData({...formData, image: e.target.value})} placeholder="https://..."
                    className="w-full bg-white border border-luxury-ink/5 rounded-2xl py-4 pl-13 pr-4 luxury-shadow focus:outline-none focus:border-brand-teal transition-all text-sm font-medium" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Item Title</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} placeholder="e.g., HC Verma Vol 1" required maxLength={100}
                  className="w-full bg-white border border-luxury-ink/5 rounded-2xl py-4 px-6 luxury-shadow focus:outline-none focus:border-brand-teal transition-all text-sm font-medium" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Desired Price (₹)</label>
                <input type="number" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} placeholder="500" required min="0"
                  className="w-full bg-white border border-luxury-ink/5 rounded-2xl py-4 px-6 luxury-shadow focus:outline-none focus:border-brand-teal transition-all text-sm font-medium" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Category</label>
                <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full bg-white border border-luxury-ink/5 rounded-2xl py-4 px-6 luxury-shadow focus:outline-none focus:border-brand-teal transition-all text-sm font-medium appearance-none">
                  {categories.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Condition</label>
                <select value={formData.condition} onChange={(e) => setFormData({...formData, condition: e.target.value})}
                  className="w-full bg-white border border-luxury-ink/5 rounded-2xl py-4 px-6 luxury-shadow focus:outline-none focus:border-brand-teal transition-all text-sm font-medium appearance-none">
                  <option>Brand New</option><option>Like New</option><option>Good</option><option>Used</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Description</label>
              <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Describe the condition, history, and usage details..." rows={4} maxLength={2000}
                className="w-full bg-white border border-luxury-ink/5 rounded-2xl py-5 px-6 luxury-shadow focus:outline-none focus:border-brand-teal transition-all text-sm font-medium resize-none" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div onClick={() => setFormData({...formData, meetup: !formData.meetup})}
                className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${formData.meetup ? 'border-brand-teal bg-brand-teal/5' : 'border-luxury-ink/5 bg-white'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${formData.meetup ? 'bg-brand-teal text-white' : 'bg-surface-soft text-luxury-ink/20'}`}><MapPin size={20} /></div>
                <div><p className="text-sm font-bold text-luxury-ink">School Meetup</p><p className="text-[10px] uppercase font-bold tracking-widest text-luxury-ink/30">Official points</p></div>
              </div>
              <div onClick={() => setFormData({...formData, delivery: !formData.delivery})}
                className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${formData.delivery ? 'border-brand-pink bg-brand-pink/5' : 'border-luxury-ink/5 bg-white'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${formData.delivery ? 'bg-brand-pink text-white' : 'bg-surface-soft text-luxury-ink/20'}`}><Truck size={20} /></div>
                <div><p className="text-sm font-bold text-luxury-ink">Local Delivery</p><p className="text-[10px] uppercase font-bold tracking-widest text-luxury-ink/30">Porter / Instamart</p></div>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting}
              className="w-full bg-luxury-ink text-white py-5 rounded-2xl font-bold text-base hover:bg-brand-teal transition-all luxury-shadow active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting ? 'Publishing...' : 'Submit for Review'} <ChevronRight size={20} />
            </button>

            <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/20 text-center">
              Your listing will be reviewed by an admin before going live.
            </p>
          </form>
        </div>

        {/* Right: Live Preview */}
        <div className="hidden lg:sticky lg:top-32 lg:block">
          <div className="mb-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-2">Live Preview</h4>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden luxury-shadow border border-luxury-ink/5 p-4 max-w-sm">
            <div className="aspect-[4/3] rounded-xl bg-luxury-ink/5 overflow-hidden flex items-center justify-center relative mb-5">
              {(imagePreview || formData.image) ? (
                <img src={imagePreview || formData.image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Sparkles className="text-luxury-ink/10" size={48} />
              )}
              <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-brand-teal">
                {formData.condition}
              </div>
            </div>
            <div className="px-2 pb-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40">{formData.category}</p>
                <p className="text-xl font-serif font-bold text-luxury-ink">₹{formData.price || '0'}</p>
              </div>
              <h3 className="text-lg font-bold text-luxury-ink mb-5">{formData.title || 'Untitled Listing'}</h3>
              <div className="flex items-center gap-3 border-t border-luxury-ink/5 pt-5">
                <div className="w-9 h-9 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-serif font-bold text-sm">
                  {userData?.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-xs font-bold text-luxury-ink">{userData?.name || 'You'}</p>
                  <p className="text-[10px] font-medium text-luxury-ink/30 tracking-wider flex items-center gap-1">
                    <ShieldCheck size={10} className="text-brand-teal" /> {userData?.school || 'Your School'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
