/**
 * Bottom interaction bar for viewing OTHER people's stories.
 * Shows a text reply input and a heart (like) button, Instagram-style.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Send } from 'lucide-react';
import {
  toggleStoryLike,
  hasLikedStory,
  sendStoryReply,
} from '../../lib/stories';
import { createNotification } from '../../lib/notifications';

interface Props {
  storyId: string;
  storyAuthorId: string;
  currentUid: string;
  currentUsername: string;
  /** Pause the story progress while the user is typing. */
  onFocus: () => void;
  /** Resume the story progress when the input loses focus. */
  onBlur: () => void;
}

export default function StoryInteractionBar({
  storyId,
  storyAuthorId,
  currentUid,
  currentUsername,
  onFocus,
  onBlur,
}: Props) {
  const [liked, setLiked] = useState(false);
  const [likeBurst, setLikeBurst] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check initial like state
  useEffect(() => {
    let alive = true;
    hasLikedStory(storyId, currentUid)
      .then((v) => alive && setLiked(v))
      .catch(() => {});
    return () => { alive = false; };
  }, [storyId, currentUid]);

  const handleLike = useCallback(async () => {
    const newState = await toggleStoryLike(storyId, currentUid);
    setLiked(newState);
    if (newState) {
      setLikeBurst((n) => n + 1);
      // Notify story owner
      if (storyAuthorId !== currentUid) {
        createNotification({
          userId: storyAuthorId,
          type: 'new_message',
          title: 'Story Liked ❤️',
          message: `${currentUsername} liked your story`,
          link: '/community',
        }).catch(() => {});
      }
    }
  }, [storyId, storyAuthorId, currentUid, currentUsername]);

  const handleSend = useCallback(async () => {
    const text = replyText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendStoryReply(storyId, currentUid, currentUsername, text);
      setReplyText('');
      setSent(true);
      setTimeout(() => setSent(false), 2000);
      // Notify story owner
      if (storyAuthorId !== currentUid) {
        createNotification({
          userId: storyAuthorId,
          type: 'new_message',
          title: 'Story Reply',
          message: `${currentUsername}: ${text.slice(0, 80)}`,
          link: '/community',
        }).catch(() => {});
      }
      inputRef.current?.blur();
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  }, [replyText, sending, storyId, storyAuthorId, currentUid, currentUsername]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSend();
    }
    // Stop keyboard events from bubbling to the viewer's navigation handler
    e.stopPropagation();
  };

  return (
    <div
      className="absolute bottom-0 inset-x-0 p-3 pt-10 bg-gradient-to-t from-black/70 to-transparent pointer-events-auto z-10"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        {/* Reply input */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            placeholder="Send a reply…"
            maxLength={500}
            className="w-full bg-white/15 backdrop-blur-md text-white placeholder-white/50 text-sm font-medium rounded-full px-4 py-2.5 pr-10 border border-white/20 focus:outline-none focus:border-white/40 transition-colors"
          />
          <AnimatePresence>
            {replyText.trim() && (
              <motion.button
                type="button"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={handleSend}
                disabled={sending}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-brand-teal text-white disabled:opacity-50 transition-opacity"
                aria-label="Send reply"
              >
                <Send size={14} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Like button */}
        <motion.button
          type="button"
          onClick={handleLike}
          whileTap={{ scale: 0.8 }}
          className="w-10 h-10 flex items-center justify-center shrink-0"
          aria-label={liked ? 'Unlike story' : 'Like story'}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={likeBurst}
              initial={likeBurst > 0 ? { scale: 0.4 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
              className="grid place-items-center"
            >
              <Heart
                size={26}
                strokeWidth={1.75}
                className={`transition-colors ${liked ? 'fill-red-500 text-red-500' : 'text-white'}`}
              />
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Sent confirmation */}
      <AnimatePresence>
        {sent && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-white/70 text-xs font-medium text-center mt-2"
          >
            Reply sent ✓
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
