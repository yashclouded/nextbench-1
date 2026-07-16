import { LinkPreview } from '../../lib/linkPreview';
import SmartImage from '../ui/SmartImage';

interface LinkPreviewCardProps {
  preview: LinkPreview;
  isMe: boolean;
}

/**
 * Compact OpenGraph preview card rendered beneath a chat message's text.
 * The whole card links out; stopPropagation keeps a tap from opening the
 * message context menu.
 */
export function LinkPreviewCard({ preview, isMe }: LinkPreviewCardProps) {
  const { url, title, description, image, siteName } = preview;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`mt-2 block overflow-hidden rounded-xl border no-underline transition-opacity hover:opacity-90 ${
        isMe ? 'border-white/20 bg-black/10' : 'border-luxury-ink/10 bg-surface-soft'
      }`}
      style={{ maxWidth: 280 }}
    >
      {image && (
        <div className="w-full bg-black/5">
          <SmartImage src={image} alt={title || 'Link preview'} ratio={1.91} fit="cover" className="w-full" />
        </div>
      )}
      <div className="px-3 py-2">
        {siteName && (
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 truncate ${isMe ? 'text-white/60' : 'text-luxury-ink/40'}`}>
            {siteName}
          </p>
        )}
        {title && (
          <p className={`text-xs font-bold leading-snug line-clamp-2 ${isMe ? 'text-white' : 'text-luxury-ink'}`}>
            {title}
          </p>
        )}
        {description && (
          <p className={`text-[11px] leading-snug line-clamp-2 mt-0.5 ${isMe ? 'text-white/70' : 'text-luxury-ink/50'}`}>
            {description}
          </p>
        )}
      </div>
    </a>
  );
}
