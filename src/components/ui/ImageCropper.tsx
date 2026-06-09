import React, { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { X, ZoomIn, ZoomOut, Check, RotateCw } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useTheme } from '../../lib/ThemeContext';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
  aspect?: number; // default 1 (square)
}

export default function ImageCropper({ imageSrc, onCropComplete, onCancel, aspect = 1 }: ImageCropperProps) {
  useScrollLock(true);
  const { isDark } = useTheme(); 
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [selectedAspect, setSelectedAspect] = useState(aspect);
  
  const [naturalAspect, setNaturalAspect] = useState<number>(1);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNaturalAspect(img.width / img.height);
    img.src = imageSrc;
  }, [imageSrc]);
  const onCropDone = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;

    const canvas = document.createElement('canvas');
    const image = new Image();
    image.crossOrigin = 'anonymous';

    await new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.src = imageSrc;
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply rotation
    const maxSize = Math.max(image.width, image.height);
    const safeSize = 2 * maxSize;
    canvas.width = safeSize;
    canvas.height = safeSize;
    
    ctx.translate(safeSize / 2, safeSize / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-image.width / 2, -image.height / 2);
    ctx.drawImage(image, 0, 0);

    // Get rotated image data
    const data = ctx.getImageData(0, 0, safeSize, safeSize);

    // Set output canvas to cropped dimensions
    canvas.width = croppedAreaPixels.width;
    canvas.height = croppedAreaPixels.height;

    ctx.putImageData(
      data,
      -croppedAreaPixels.x - (safeSize - image.width) / 2,
      -croppedAreaPixels.y - (safeSize - image.height) / 2
    );

    canvas.toBlob(
      (blob) => {
        if (blob) onCropComplete(blob);
      },
      'image/jpeg',
      0.92
    );
  }, [croppedAreaPixels, imageSrc, onCropComplete, rotation]);

  return (
    <div className="fixed inset-0 z-200 flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 backdrop-blur-xl border-b border-white/10 bg-[#111111]">
        <button onClick={onCancel} className="p-2 text-white/60 hover:text-white transition-colors rounded-xl hover:bg-white/10">
          <X size={22} />
        </button>
        <h3 className="text-white font-bold text-sm uppercase tracking-widest">Crop Image</h3>
        <button onClick={handleConfirm} className="flex items-center gap-2 bg-brand-teal text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-brand-pink transition-all shadow-lg">
          <Check size={16} /> Done
        </button>
      </div>

      {/* Crop Area */}
      <div className="flex-1 relative">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          {...(selectedAspect !== 0 ? { aspect: selectedAspect } : {})}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropDone}
          cropShape="rect"
          showGrid={true}
          style={{
            containerStyle: { background: '#0a0a0a' },
            cropAreaStyle: { border: '2px solid rgba(58, 139, 149, 0.6)' }
          }}
        />
      </div>

      {/* Controls */}
      <div className="px-6  py-5 backdrop-blur-xl border-t border-white/10 bg-[#111111]">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {/* Aspect Ratio Toggles */}
          <div className="flex gap-2">
            {[
              { label: 'Original', value: naturalAspect },
              { label: '1:1', value: 1 },
              { label: '4:5', value: 4/5 },
              { label: '9:16', value: 9/16 },
              { label: '16:9', value: 16/9 },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setSelectedAspect(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  selectedAspect === opt.value
                    ? 'bg-brand-teal text-white'
                    : 'bg-white/10 text-white/40 hover:bg-white/20 hover:text-white/70'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Zoom & Rotation */}
          <div className="flex items-center gap-3">
            <button onClick={() => setZoom(z => Math.max(1, z - 0.2))} className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10">
              <ZoomOut size={18} />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-brand-teal"
            />
            <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10">
              <ZoomIn size={18} />
            </button>
            <button onClick={() => setRotation(r => (r + 90) % 360)} className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10 ml-2">
              <RotateCw size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
