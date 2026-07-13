import React, { useState, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';

interface SmartImageProps {
  src?: string | null;
  alt?: string;
  w?: number;
  h?: number;
  ratio?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  className?: string;
  priority?: boolean;
  draggable?: boolean;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
}

export default function SmartImage({
  src,
  alt = '',
  w,
  h,
  ratio,
  fit = 'cover',
  className = '',
  priority = false,
  draggable = false,
  onClick,
}: SmartImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);

  // Reset state when source changes
  useEffect(() => {
    setIsLoaded(false);
    setIsError(false);
  }, [src]);

  if (!src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-surface-soft border border-luxury-ink/5 text-luxury-ink/20">
        <ImageIcon size={24} />
      </div>
    );
  }

  // Cloudinary URL checks
  const isCloudinary = src.includes('res.cloudinary.com');

  // Build responsive SrcSet for Cloudinary URLs
  const getCloudinarySrcSet = (url: string) => {
    if (!isCloudinary || !url.includes('/upload/')) return undefined;
    const widths = [320, 640, 960, 1280];
    return widths
      .map((width) => {
        const optUrl = url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
        return `${optUrl} ${width}w`;
      })
      .join(', ');
  };

  // Build Low-Quality Image Placeholder (LQIP) URL
  const getCloudinaryLqip = (url: string) => {
    if (!isCloudinary || !url.includes('/upload/')) return undefined;
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_24,e_blur:400,q_30/');
  };

  // Fallback optimal URL for src
  const getOptimizedSrc = (url: string) => {
    if (!isCloudinary || !url.includes('/upload/')) return url;
    // Set auto format, auto quality, and fit limits
    const limitWidth = w ? Math.min(w, 1020) : 800;
    return url.replace('/upload/', `/upload/f_auto,q_auto,w_${limitWidth},c_limit/`);
  };

  const optimizedSrc = getOptimizedSrc(src);
  const srcSet = getCloudinarySrcSet(src);
  const lqip = getCloudinaryLqip(src);

  // Determine Aspect Ratio
  let aspectRatio: string | undefined;
  if (w && h) {
    aspectRatio = `${w}/${h}`;
  } else if (ratio) {
    aspectRatio = String(ratio);
  }

  if (isError) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center bg-surface-soft border border-luxury-ink/5 text-luxury-ink/30 p-4 text-center"
        style={{ aspectRatio }}
      >
        <ImageIcon size={20} className="mb-1" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Image Unavailable</span>
      </div>
    );
  }

  const fitClasses = {
    cover: 'object-cover',
    contain: 'object-contain',
    fill: 'object-fill',
    none: 'object-none',
    'scale-down': 'object-scale-down'
  };
  const fitClass = fitClasses[fit] || 'object-cover';

  return (
    <div
      className="relative w-full overflow-hidden bg-surface-soft select-none"
      style={{
        aspectRatio,
        backgroundImage: lqip ? `url(${lqip})` : undefined,
        backgroundSize: fit,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <img
        src={optimizedSrc}
        srcSet={srcSet}
        sizes={srcSet ? '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' : undefined}
        alt={alt}
        className={`w-full h-full ${fitClass} transition-opacity duration-300 ease-out ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        } ${className}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsError(true)}
        loading={priority ? 'eager' : 'lazy'}
        referrerPolicy="no-referrer"
        draggable={draggable}
        onClick={onClick}
      />
    </div>
  );
}
