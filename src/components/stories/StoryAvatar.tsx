/**
 * A single story bubble in the row: gradient ring (unseen) / gray ring (seen) / faint
 * (none), avatar, truncated label, and an optional `+` badge (used on the "Your story"
 * bubble to add — wired to the creation flow in Phase 3).
 */
import { Plus } from 'lucide-react';
import { getOptimizedImageUrl } from '../../lib/utils';

type Ring = 'unseen' | 'seen' | 'none';

interface Props {
  username: string;
  photoURL: string | null;
  ring: Ring;
  label?: string;
  onClick?: () => void;
  showPlus?: boolean;
  onPlusClick?: () => void;
}

const UNSEEN_RING = 'linear-gradient(135deg, var(--color-brand-teal), var(--color-brand-pink))';

function ringBackground(ring: Ring): string {
  if (ring === 'unseen') return UNSEEN_RING;
  if (ring === 'seen') return 'var(--color-border-strong)';
  return 'var(--color-border)';
}

export default function StoryAvatar({ username, photoURL, ring, label, onClick, showPlus, onPlusClick }: Props) {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0 w-[72px]">
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          className="block rounded-full p-[2.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          style={{ background: ringBackground(ring) }}
          aria-label={label ?? username}
        >
          <div className="rounded-full p-[2px]" style={{ background: 'var(--color-surface-base)' }}>
            <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-brand-teal/10 text-brand-teal font-bold text-xl">
              {photoURL ? (
                <img
                  src={getOptimizedImageUrl(photoURL)}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              ) : (
                (username?.charAt(0) || '?').toUpperCase()
              )}
            </div>
          </div>
        </button>

        {showPlus && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlusClick?.();
            }}
            className="absolute bottom-0 right-0 flex items-center justify-center w-6 h-6 rounded-full text-white shadow-md ring-2"
            style={{ background: 'var(--color-brand-teal)', borderColor: 'var(--color-surface-base)' }}
            aria-label="Add to your story"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        )}
      </div>

      <span className="text-[11px] leading-tight truncate max-w-[68px]" style={{ color: 'var(--color-luxury-ink)' }}>
        {label ?? username}
      </span>
    </div>
  );
}
