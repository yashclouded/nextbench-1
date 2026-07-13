import React from 'react';

// ─── Primitive Skeletons ───────────────────────────────────────────

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      className={`skeleton shrink-0 ${className}`}
      {...props}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  const widths = ['w-full', 'w-[92%]', 'w-[85%]', 'w-[70%]', 'w-[60%]'];
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => {
        // Cycle widths or choose a random width for natural look
        const widthClass = widths[i % widths.length];
        return <Skeleton key={i} className={`h-3 ${widthClass} rounded-full`} />;
      })}
    </div>
  );
}

interface SkeletonAvatarProps {
  size?: 'sm' | 'md' | 'lg' | number;
  className?: string;
}

export function SkeletonAvatar({ size = 'md', className = '' }: SkeletonAvatarProps) {
  const sizeClass = 
    size === 'sm' ? 'w-8 h-8' :
    size === 'md' ? 'w-10 h-10' :
    size === 'lg' ? 'w-16 h-16' : 
    typeof size === 'number' ? `w-${size} h-${size}` : 'w-10 h-10';

  // Fallback for custom number sizes
  const style = typeof size === 'number' ? { width: `${size}px`, height: `${size}px` } : undefined;

  return (
    <Skeleton 
      className={`rounded-full ${style ? '' : sizeClass} ${className}`} 
      style={style}
    />
  );
}

interface SkeletonImageProps {
  ratio?: string;
  className?: string;
}

export function SkeletonImage({ ratio = 'aspect-4/3', className = '' }: SkeletonImageProps) {
  return (
    <Skeleton className={`${ratio} w-full rounded-xl ${className}`} />
  );
}


// ─── Composed Skeletons ────────────────────────────────────────────

// Memoized Post Card Skeleton matching the real PostCard dimensions
export const PostCardSkeleton = React.memo(function PostCardSkeleton() {
  return (
    <div 
      className="p-5 sm:p-6 md:p-8 flex flex-col w-full border-b" 
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}
    >
      {/* Avatar + name row */}
      <div className="flex items-center gap-2.5 mb-4">
        <SkeletonAvatar size="sm" />
        <div className="flex flex-col gap-1 flex-1">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-2.5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      {/* Title */}
      <Skeleton className="h-6 w-3/4 rounded-lg mb-3" />
      {/* Content lines */}
      <SkeletonText lines={3} className="mb-6" />
      {/* Action bar */}
      <div className="flex items-center gap-5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <Skeleton className="h-8 w-12 rounded-full" />
        <Skeleton className="h-8 w-12 rounded-full" />
        <Skeleton className="h-8 w-10 rounded-full" />
      </div>
    </div>
  );
});

// Product Card Skeleton matching the real ProductCard dimensions
export const ProductCardSkeleton = React.memo(function ProductCardSkeleton() {
  return (
    <div 
      className="p-4 flex flex-col w-full border-b"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}
    >
      {/* Header (Seller details) */}
      <div className="flex items-center gap-3 mb-4">
        <SkeletonAvatar size="sm" />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-2.5 w-32 rounded-full" />
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <Skeleton className="h-4 w-12 rounded-full" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
      </div>
      {/* Product Title */}
      <Skeleton className="h-4 w-2/3 rounded-full mb-3" />
      {/* Product Image (aspect-4/3) */}
      <SkeletonImage ratio="aspect-4/3" className="mb-4" />
      {/* Footer Info */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24 rounded-full" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>
    </div>
  );
});

// Message Bubble Skeleton
export const MessageBubbleSkeleton = React.memo(function MessageBubbleSkeleton({ align = 'left' }: { align?: 'left' | 'right' }) {
  const isRight = align === 'right';
  const widthClass = isRight ? 'w-[55%]' : 'w-[65%]';
  return (
    <div className={`flex w-full mb-4 ${isRight ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-end gap-2.5 max-w-[70%] ${isRight ? 'flex-row-reverse' : ''}`}>
        {!isRight && <SkeletonAvatar size="sm" className="w-8 h-8" />}
        <Skeleton className={`h-10 rounded-2xl ${widthClass} ${isRight ? 'rounded-br-none bg-brand-teal/10' : 'rounded-bl-none'}`} />
      </div>
    </div>
  );
});

// List Row Skeleton (e.g. Chat list rows)
export const ListRowSkeleton = React.memo(function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <SkeletonAvatar size="md" />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-3.5 w-1/3 rounded-full" />
        <Skeleton className="h-3 w-3/4 rounded-full" />
      </div>
      <Skeleton className="h-3 w-10 rounded-full self-start" />
    </div>
  );
});

// Profile Header Skeleton
export const ProfileHeaderSkeleton = React.memo(function ProfileHeaderSkeleton() {
  return (
    <div className="w-full">
      {/* Cover image (aspect-3/1) */}
      <Skeleton className="w-full aspect-[3/1] rounded-b-3xl" />
      {/* Profile details block */}
      <div className="px-6 -mt-10 mb-8 relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <SkeletonAvatar size="lg" className="w-24 h-24 sm:w-28 sm:h-28 ring-4 ring-surface-base" />
          <div className="flex flex-col gap-2 mb-2">
            <Skeleton className="h-6 w-44 rounded-lg" />
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="h-4.5 w-60 rounded-full" />
          </div>
        </div>
        <div className="flex gap-2 mb-2">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
});

// Notification Row Skeleton
export const NotificationRowSkeleton = React.memo(function NotificationRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <SkeletonAvatar size="sm" className="w-9 h-9" />
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-1/2 rounded-full" />
        <Skeleton className="h-3 w-[90%] rounded-full" />
      </div>
      <Skeleton className="h-2 w-12 rounded-full" />
    </div>
  );
});

// Review Row Skeleton
export const ReviewRowSkeleton = React.memo(function ReviewRowSkeleton() {
  return (
    <div className="p-4 border-b flex flex-col gap-2" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center gap-2">
        <SkeletonAvatar size="sm" className="w-8 h-8" />
        <div className="flex-1 flex flex-col gap-1">
          <Skeleton className="h-3 w-20 rounded-full" />
          <Skeleton className="h-2 w-28 rounded-full" />
        </div>
        <Skeleton className="h-3 w-16 rounded-full" />
      </div>
      <SkeletonText lines={2} />
    </div>
  );
});


// ─── Route Skeletons (Page Shells) ──────────────────────────────────

export function FeedSkeleton() {
  return (
    <div className="w-full max-w-[640px] mx-auto">
      {/* Stories row skeleton */}
      <div className="flex gap-4 p-4 overflow-hidden border-b" style={{ borderColor: 'var(--color-border)' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 shrink-0">
            <SkeletonAvatar size="md" className="w-14 h-14 ring-2 ring-offset-2 ring-brand-teal/20" />
            <Skeleton className="h-2.5 w-10 rounded-full" />
          </div>
        ))}
      </div>
      {/* Compose bar skeleton */}
      <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
        <SkeletonAvatar size="sm" />
        <Skeleton className="h-10 flex-1 rounded-full" />
      </div>
      {/* Posts list */}
      <div className="flex flex-col">
        {Array.from({ length: 5 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function MarketplaceSkeleton() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="w-full">
      <ProfileHeaderSkeleton />
      {/* Tab bar skeleton */}
      <div className="flex gap-4 border-b px-6 mb-6" style={{ borderColor: 'var(--color-border)' }}>
        <Skeleton className="h-10 w-20 rounded-t-lg" />
        <Skeleton className="h-10 w-24 rounded-t-lg" />
        <Skeleton className="h-10 w-20 rounded-t-lg" />
      </div>
      {/* Grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonImage key={i} ratio="aspect-square" />
        ))}
      </div>
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col md:flex-row gap-8">
      {/* Product Image Gallery Block */}
      <div className="flex-1">
        <SkeletonImage ratio="aspect-square" className="rounded-2xl" />
        <div className="flex gap-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-20 h-20 rounded-lg" />
          ))}
        </div>
      </div>
      {/* Product Details Block */}
      <div className="flex-1 flex flex-col gap-4">
        <Skeleton className="h-4.5 w-24 rounded-full" />
        <Skeleton className="h-8 w-3/4 rounded-lg" />
        <Skeleton className="h-6 w-32 rounded-full" />
        <hr className="border-t my-2" style={{ borderColor: 'var(--color-border)' }} />
        {/* Seller Info */}
        <div className="flex items-center gap-3 my-2">
          <SkeletonAvatar size="md" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="h-3 w-40 rounded-full" />
          </div>
        </div>
        <hr className="border-t my-2" style={{ borderColor: 'var(--color-border)' }} />
        <SkeletonText lines={4} />
        <div className="flex gap-4 mt-6">
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="h-12 w-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="flex h-full w-full">
      {/* Left panel (Chat list) */}
      <div className="w-full md:w-80 lg:w-96 border-r flex flex-col h-full shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="flex-1 overflow-y-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      </div>
      {/* Right panel (Empty state or Chat panel) */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-surface-soft/20 h-full">
        <Skeleton className="w-16 h-16 rounded-full mb-4" />
        <Skeleton className="h-4 w-48 rounded-full" />
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full w-full">
      {/* Chat Header */}
      <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <SkeletonAvatar size="sm" />
        <div className="flex-1 flex flex-col gap-1">
          <Skeleton className="h-3.5 w-24 rounded-full" />
          <Skeleton className="h-2.5 w-16 rounded-full" />
        </div>
      </div>
      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-hidden">
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="right" />
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="right" />
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="right" />
      </div>
      {/* Composer */}
      <div className="p-4 border-t flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <Skeleton className="h-10 flex-1 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function NotificationsSkeleton() {
  return (
    <div className="pt-32 pb-20 px-6 max-w-3xl mx-auto w-full">
      <div className="flex flex-col gap-2 mb-8">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-3 w-20 rounded-full" />
      </div>
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <NotificationRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div className="pt-32 pb-20 px-6 max-w-3xl mx-auto w-full">
      {/* Search Input Box */}
      <div className="mb-8">
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
      {/* Search Tabs */}
      <div className="flex gap-2 overflow-x-auto mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      {/* Search results placeholder list */}
      <div className="flex flex-col">
        {Array.from({ length: 6 }).map((_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
