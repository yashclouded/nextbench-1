import React from 'react';
import { Link } from 'react-router-dom';

interface LinkifiedTextProps {
  text: string;
  className?: string;
  /** When rendered inside the current user's own (teal) bubble, links need a
   *  light color to stay legible — teal-on-teal is invisible. */
  isMe?: boolean;
}

const LinkifiedText = React.forwardRef<HTMLSpanElement, LinkifiedTextProps>(function LinkifiedText({ text, className = '', isMe = false }, ref) {
  if (!text) return null;

  // On own (teal) bubbles use white/underline; otherwise the brand-teal accent.
  const linkClass = isMe
    ? 'underline decoration-white/60 hover:decoration-white break-all text-white font-medium'
    : 'text-brand-teal hover:underline break-all';
  const mentionClass = isMe
    ? 'underline decoration-white/60 hover:decoration-white text-white font-semibold'
    : 'text-brand-teal font-semibold hover:underline';

  // Combined regex to detect URLs and @mentions
  // Group 1: URL, Group 2: @username
  const combinedRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)|(@[a-zA-Z][a-zA-Z0-9_.]{2,19})\b/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      // URL match
      const url = match[1];
      const href = url.startsWith('http') ? url : `https://${url}`;
      parts.push(
        <a
          key={`url-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
      );
    } else if (match[2]) {
      // @mention match
      const mention = match[2]; // includes the @
      const username = mention.slice(1).toLowerCase();
      parts.push(
        <Link
          key={`mention-${match.index}`}
          to={`/u/${username}`}
          className={mentionClass}
          onClick={(e) => e.stopPropagation()}
        >
          {mention}
        </Link>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return <span ref={ref} className={className}>{parts}</span>;
});

export default LinkifiedText;

