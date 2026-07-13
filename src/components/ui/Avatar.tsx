import React from 'react';
import SmartImage from './SmartImage';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
}

export default function Avatar({ src, name = 'User', size = 'md', className = '' }: AvatarProps) {
  // Size classes map
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-[15px]',
    xl: 'w-16 h-16 text-xl',
  };

  const isPresetSize = typeof size === 'string';
  const customStyle = isPresetSize ? {} : { width: size, height: size, fontSize: size ? size * 0.4 : undefined };
  const sizeClass = isPresetSize ? sizeClasses[size as keyof typeof sizeClasses] : '';

  // Get name initials (up to 2 letters)
  const getInitials = (n: string) => {
    if (!n) return '?';
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0][0]?.toUpperCase() || '?';
  };

  const initials = getInitials(name);

  return (
    <div
      style={customStyle}
      className={`rounded-full overflow-hidden flex items-center justify-center bg-brand-teal/5 text-brand-teal font-bold uppercase select-none border border-luxury-ink/5 shrink-0 relative ${sizeClass} ${className}`}
    >
      {src ? (
        <SmartImage
          src={src}
          alt={name}
          ratio={1}
          fit="cover"
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="leading-none">{initials}</span>
      )}
    </div>
  );
}
