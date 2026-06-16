import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Truck, ChevronRight, Upload, X, Link as LinkIcon, Tag } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { categories } from '../../mockData';
import { useAuth } from '../../lib/AuthContext';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../lib/ToastContext';
import { uploadProductImage } from '../../lib/storage';
import { isHeicFile, convertHeicToJpeg } from '../../lib/heic-converter';

interface SelectedImage {
  id: string;
  type: 'file' | 'url';
  file?: File;
  previewUrl: string;
}

export default function SellItem() {
  const { id } = useParams<{ id: string }>(); // for edit mode
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!id);
  const [uploadMode, setUploadMode] = useState<'upload' | 'url'>('upload');
  
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [urlInput, setUrlInput] = useState('');
  
  // Tags state
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0); // track nested drag-enter/leave pairs

  const [formData, setFormData] = useState({
    title: '',
    price: '',
    category: 'Books',
    condition: 'Like New',
    description: '',
    meetup: true,
    delivery: false
  });

  useEffect(() => {
    if (!id || !user) return;
    
    const fetchListing = async () => {
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.sellerId !== user.uid && !userData?.isAdmin) {
            showToast('You can only edit your own listings.', 'error');
            navigate('/dashboard');
            return;
          }
          
          setFormData({
            title: data.title || '',
            price: data.price?.toString() || '',
            category: data.category || 'Books',
            condition: data.condition || 'Like New',
            description: data.description || '',
            meetup: data.meetupAvailable ?? true,
            delivery: data.deliveryAvailable ?? false
          });
          
          if (data.tags) {
            setTags(data.tags);
          }
          
          const images = data.images || (data.image ? [data.image] : []);
          const existingImages = images.map((url: string) => ({
            id: Math.random().toString(36).substring(2, 9),
            type: 'url' as const,
            previewUrl: url
          }));
          setSelectedImages(existingImages);
        } else {
          showToast('Listing not found', 'error');
          navigate('/dashboard');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `products/${id}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchListing();
  }, [id, user?.uid, navigate, userData, showToast]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    // reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleAddUrl = () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) return;

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      showToast('Please enter a valid absolute URL (starting with http:// or https://)', 'warning');
      return;
    }

    if (selectedImages.length >= 5) {
      showToast('Maximum of 5 images allowed', 'warning');
      return;
    }

    const newImage: SelectedImage = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'url',
      previewUrl: trimmedUrl
    };

    setSelectedImages(prev => [...prev, newImage]);
    setUrlInput('');
  };

  const removeImage = (imgId: string) => {
    const imageToRemove = selectedImages.find(img => img.id === imgId);
    if (imageToRemove?.type === 'file') {
      URL.revokeObjectURL(imageToRemove.previewUrl);
    }
    setSelectedImages(prev => prev.filter(img => img.id !== imgId));
  };
  
  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (newTag && !tags.includes(newTag)) {
        if (tags.length >= 10) {
          showToast('Maximum of 10 tags allowed', 'warning');
          return;
        }
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  // ─── Shared file processor (used by file-input, drag-drop, and paste) ──────
  const processFiles = useCallback(async (files: File[]) => {
    const remainingSlots = 5 - selectedImages.length;
    if (remainingSlots <= 0) {
      showToast('Maximum of 5 images allowed', 'warning');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      showToast(`Only adding the first ${remainingSlots} images to stay within the 5 image limit.`, 'info');
    }

    const newImages: SelectedImage[] = [];
    for (let f of filesToProcess) {
      let file = f as File;
      const isHeic = isHeicFile(file);
      const isStandardImage = file.type.startsWith('image/');

      if (!isHeic && !isStandardImage) {
        showToast(`"${file.name}" is not a recognized image file`, 'warning');
        continue;
      }
      if (isHeic) {
        showToast(`Converting "${file.name}" from HEIC...`, 'info');
        file = await convertHeicToJpeg(file);
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast(`"${file.name}" is over 5MB`, 'warning');
        continue;
      }
      newImages.push({
        id: Math.random().toString(36).substring(2, 9),
        type: 'file',
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (newImages.length > 0) {
      setSelectedImages(prev => [...prev, ...newImages]);
    }
  }, [selectedImages.length, showToast]);

  // ─── Paste from clipboard (Ctrl+V / ⌘V) ────────────────────────────────────
  useEffect(() => {
    if (uploadMode !== 'upload') return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
        showToast('Image pasted from clipboard!', 'success');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [uploadMode, processFiles, showToast]);

  // ─── Drag-and-drop handlers ─────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // required to allow drop
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (uploadMode !== 'upload') return;
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/') || isHeicFile(f)
    );
    if (files.length === 0) {
      showToast('No image files detected in drop', 'warning');
      return;
    }
    processFiles(files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData) { showToast('Must be logged in.', 'warning'); return; }
    if (!userData.verified && !userData.isAdmin) { showToast('Only verified users can sell items.', 'warning'); return; }

    const titleTrimmed = formData.title.trim();
    const priceNum = Number(formData.price);

    if (titleTrimmed.length < 3) { showToast('Title must be at least 3 characters.', 'warning'); return; }
    if (isNaN(priceNum) || priceNum < 1) { showToast('Price must be at least ₹1.', 'warning'); return; }
    if (priceNum > 100000) { showToast('Price cannot exceed ₹1,00,000.', 'warning'); return; }

    if (selectedImages.length === 0) {
      showToast('Please add at least one product image.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      showToast('Processing listing...', 'info');

      // Upload files in parallel using Promise.all
      const uploadPromises = selectedImages.map(async (img) => {
        if (img.type === 'file' && img.file) {
          return await uploadProductImage(img.file, user.uid);
        }
        return img.previewUrl;
      });

      const imageUrls = await Promise.all(uploadPromises);

      const payload = {
        title: titleTrimmed,
        price: priceNum,
        condition: formData.condition,
        category: formData.category,
        image: imageUrls[0], // primary / legacy fallback
        images: imageUrls, // all listing images
        description: formData.description,
        meetupAvailable: formData.meetup,
        deliveryAvailable: formData.delivery,
        tags: tags,
        updatedAt: serverTimestamp()
      };

      if (id) {
        // Edit mode
        await updateDoc(doc(db, 'products', id), payload);
        showToast('Listing updated successfully!', 'success');
        navigate(`/product/${id}`);
      } else {
        // Create mode
        await addDoc(collection(db, 'products'), {
          ...payload,
          sellerId: user.uid,
          sellerName: userData.name,
          sellerSchool: userData.school,
          status: 'pending',
          sellerProfilePicture: userData?.profilePicture || null,
          createdAt: serverTimestamp()
        });
        showToast('Listing submitted for admin review!', 'success');
        navigate('/dashboard');
      }
    } catch (err) {
      handleFirestoreError(err, id ? OperationType.UPDATE : OperationType.CREATE, 'products');
      showToast(`Failed to ${id ? 'update' : 'create'} listing`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-32 pb-20 px-6 max-w-2xl mx-auto flex justify-center">
        <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pt-24 md:pt-32 pb-20 px-4 md:px-6 max-w-3xl mx-auto">
      <div className="bg-surface-card rounded-3xl shadow-xl overflow-hidden border border-luxury-ink/5 p-6 md:p-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-luxury-ink mb-2 italic">
            {id ? 'Edit Listing' : 'List Your Asset'}
          </h1>
          <p className="text-luxury-ink/50 font-medium text-sm">
            {id ? 'Update the details for your listing.' : 'Create a premium listing for the Nextbench community.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Image upload section */}
          <div
            className="space-y-4"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Product Pictures ({selectedImages.length}/5)</label>
              <div className="flex bg-surface-base rounded-lg p-0.5">
                <button type="button" onClick={() => setUploadMode('upload')}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${uploadMode === 'upload' ? 'bg-surface-card text-brand-teal shadow-sm' : 'text-luxury-ink/30'}`}>
                  Upload
                </button>
                <button type="button" onClick={() => setUploadMode('url')}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${uploadMode === 'url' ? 'bg-surface-card text-brand-teal shadow-sm' : 'text-luxury-ink/30'}`}>
                  URL
                </button>
              </div>
            </div>

            {/* Grid of selected / uploaded images */}
            {selectedImages.length > 0 && (
              <div className={`rounded-2xl transition-all ${isDragging && uploadMode === 'upload' ? 'ring-2 ring-brand-teal ring-offset-2 bg-brand-teal/5' : ''}`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                {selectedImages.map((img, idx) => (
                  <motion.div layout key={img.id} className="relative aspect-4/3 rounded-2xl overflow-hidden bg-luxury-ink/5 border border-brand-teal/10 group shadow-sm">
                    <img src={img.previewUrl} alt={`Product preview ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <div className="absolute top-3 left-3 bg-brand-teal text-white px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wider shadow-sm">
                        Cover
                      </div>
                    )}
                    <button type="button" onClick={() => removeImage(img.id)} className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-md hover:bg-red-50 hover:text-red-500 transition-all opacity-100 sm:opacity-0 group-hover:opacity-100">
                      <X size={12} />
                    </button>
                  </motion.div>
                ))}
                {selectedImages.length < 5 && uploadMode === 'upload' && (
                  <label className="group relative border-2 border-dashed border-luxury-ink/10 rounded-2xl aspect-4/3 flex flex-col items-center justify-center p-4 transition-all hover:border-brand-teal hover:bg-brand-teal/5 cursor-pointer">
                    <input type="file" accept="image/*,.heic,.heif" multiple onChange={handleFileSelect} className="hidden" />
                    <Upload className="text-luxury-ink/20 group-hover:text-brand-teal transition-colors" size={24} />
                    <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-luxury-ink/40 text-center">Add More</p>
                  </label>
                )}
              </div>
              {uploadMode === 'upload' && (
                <p className="text-[10px] text-luxury-ink/20 mt-2 text-center">Drag images here or press Ctrl+V to paste</p>
              )}
              </div>
            )}

            {/* Main upload dropzone when list is empty */}
            {selectedImages.length === 0 && uploadMode === 'upload' && (
              <div className="relative">
                <label className={`group relative border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer block ${isDragging ? 'border-brand-teal bg-brand-teal/10 scale-[1.01]' : 'border-luxury-ink/10 hover:border-brand-teal hover:bg-brand-teal/5'}`}>
                  <input type="file" accept="image/*,.heic,.heif" multiple onChange={handleFileSelect} className="hidden" />
                  <div className="flex flex-col items-center text-center">
                    <div className={`w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mb-4 transition-transform ${isDragging ? 'scale-125 bg-brand-teal/10' : 'group-hover:scale-110'}`}>
                      <Upload className={`transition-colors ${isDragging ? 'text-brand-teal' : 'text-luxury-ink/40 group-hover:text-brand-teal'}`} size={24} />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/60 mb-1">
                      {isDragging ? 'Drop images here' : 'Click to browse, drag & drop, or paste'}
                    </p>
                    <p className="text-[10px] text-luxury-ink/30">Max 5 images • Max 5MB each • JPG, PNG, HEIC, WebP</p>
                    <p className="text-[10px] text-luxury-ink/20 mt-1">Tip: Press Ctrl+V to paste an image from your clipboard</p>
                  </div>
                </label>
              </div>
            )}

            {/* URL Input */}
            {uploadMode === 'url' && (
              <div className="space-y-3">
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-luxury-ink/30" />
                    <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }} placeholder="https://image-url.com/image.jpg..."
                      className="w-full bg-surface-base border border-luxury-ink/5 rounded-2xl py-4 pl-13 pr-4 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium" />
                  </div>
                  <button type="button" onClick={handleAddUrl} disabled={selectedImages.length >= 5}
                    className="px-6 bg-brand-teal text-white hover:bg-brand-pink transition-all rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-50">
                    Add
                  </button>
                </div>
                <p className="text-[10px] text-luxury-ink/30 ml-1">Type an absolute image URL and click Add (Max 5 URLs).</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Item Title</label>
            <input type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} placeholder="e.g., HC Verma Vol 1" required maxLength={100}
              className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Desired Price (₹)</label>
              <input type="number" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} placeholder="500" required min="1" max="100000"
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium" />
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Condition</label>
              <select value={formData.condition} onChange={(e) => setFormData({...formData, condition: e.target.value})}
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium appearance-none">
                <option>Brand New</option><option>Like New</option><option>Good</option><option>Used</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Category</label>
            <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}
              className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium appearance-none">
              {categories.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Tags (Optional)</label>
            <div className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-2 px-3 focus-within:border-brand-teal transition-all min-h-14 flex flex-wrap gap-2 items-center">
              <AnimatePresence>
                {tags.map((tag) => (
                  <motion.span 
                    key={tag} 
                    initial={{ opacity: 0, scale: 0.8 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 bg-brand-teal/10 text-brand-teal text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg"
                  >
                    <Tag size={10} />
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-red-500 transition-colors">
                      <X size={12} />
                    </button>
                  </motion.span>
                ))}
              </AnimatePresence>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder={tags.length < 10 ? "Type a tag and press Enter" : "Tag limit reached"}
                disabled={tags.length >= 10}
                className="flex-1 min-w-37.5 bg-transparent outline-none text-sm font-medium px-2 py-2 placeholder-luxury-ink/30"
              />
            </div>
            <p className="text-[10px] text-luxury-ink/30 ml-1">Add tags to make your item more searchable (e.g., "physics", "jeemains", "cycle"). Press Enter to add.</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">Description</label>
            <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Describe the condition, history, and usage details..." rows={5} maxLength={2000}
              className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium resize-none" />
            <p className="text-[10px] text-luxury-ink/30 ml-1 text-right">{formData.description.length}/2000</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div onClick={() => setFormData({...formData, meetup: !formData.meetup})}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 ${formData.meetup ? 'border-brand-teal bg-brand-teal/5' : 'border-luxury-ink/5 bg-surface-base'}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${formData.meetup ? 'bg-brand-teal text-white' : 'bg-surface-soft text-luxury-ink/30'}`}><MapPin size={18} /></div>
              <div><p className="text-sm font-bold text-luxury-ink">School Meetup</p><p className="text-[10px] uppercase font-bold tracking-widest text-luxury-ink/40">Official points</p></div>
            </div>
            <div onClick={() => setFormData({...formData, delivery: !formData.delivery})}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 ${formData.delivery ? 'border-brand-pink bg-brand-pink/5' : 'border-luxury-ink/5 bg-surface-base'}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${formData.delivery ? 'bg-brand-pink text-white' : 'bg-surface-soft text-luxury-ink/30'}`}><Truck size={18} /></div>
              <div><p className="text-sm font-bold text-luxury-ink">Local Delivery</p><p className="text-[10px] uppercase font-bold tracking-widest text-luxury-ink/40">Porter / Instamart</p></div>
            </div>
          </div>

          <div className="pt-4 border-t border-luxury-ink/5">
            <button type="submit" disabled={isSubmitting}
              className="w-full bg-brand-teal text-white py-4 rounded-xl font-bold text-sm tracking-widest uppercase hover:bg-brand-pink transition-all shadow-lg shadow-brand-teal/20 active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting ? 'Saving...' : id ? 'Update Listing' : 'Submit for Review'} <ChevronRight size={18} />
            </button>
            {!id && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 text-center mt-4">
                Your listing will be reviewed by an admin before going live.
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
