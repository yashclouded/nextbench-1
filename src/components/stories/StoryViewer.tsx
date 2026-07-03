/**
 * Full-screen immersive story viewer. Rendered via a body portal while open.
 *
 * Owns: the (authorIndex, storyIndex) cursor, progress timing (rAF for images, video
 * events for video), pause/mute, gestures (tap zones, hold-to-pause, swipe-down dismiss,
 * swipe between authors), preloading, view/seen recording, keyboard, scroll lock, and a
 * pushed history entry so browser/Android back closes the viewer.
 *
 * Navigation boundaries live in the pure `storyNavigation` module.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { AnimatePresence } from 'motion/react';
import { X, Volume2, VolumeX } from 'lucide-react';
import { getOptimizedImageUrl } from '../../lib/utils';
import {
  IMAGE_DEFAULT_DURATION_MS,
  recordStoryView,
  markAuthorSeen,
  deleteStory,
  type TrayEntry,
} from '../../lib/stories';
import { advance, rewind, jumpAuthor, clampCursor, type Cursor } from '../../lib/storyNavigation';
import StoryContent from './StoryContent';
import StoryProgressBars from './StoryProgressBars';
import StoryOwnerBar from './StoryOwnerBar';
import StoryViewersSheet from './StoryViewersSheet';

interface Props {
  tray: TrayEntry[];
  initialAuthorIndex: number;
  currentUid: string;
  onClose: () => void;
  onSeen: (authorId: string) => void;
  onDeleted?: () => void;
}

const SWIPE_CLOSE_PX = 120;
const SWIPE_AUTHOR_PX = 80;
const HOLD_MS = 200;

function timeAgo(ms: number): string {
  const diff = Math.max(Math.floor((Date.now() - ms) / 1000), 0);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function StoryViewer({ tray, initialAuthorIndex, currentUid, onClose, onSeen, onDeleted }: Props) {
  const navAuthors = useMemo(() => tray.map((e) => ({ storyCount: e.stories.length })), [tray]);

  const [cursor, setCursor] = useState<Cursor>(() =>
    clampCursor({ authorIndex: initialAuthorIndex, storyIndex: 0 }, navAuthors),
  );
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  const entry = tray[cursor.authorIndex];
  const story = entry?.stories[cursor.storyIndex];

  // ── close lifecycle (history entry so hardware/browser back closes the viewer) ──
  const closedRef = useRef(false);
  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    window.history.pushState({ storyViewer: true }, '');
    const onPop = () => finish();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [finish]);

  const requestClose = useCallback(() => {
    if (closedRef.current) return;
    window.history.back(); // → popstate → finish()
  }, []);

  const handleDelete = useCallback(() => {
    if (!story) return;
    const id = story.id;
    deleteStory(id).catch(() => {});
    onDeleted?.();
    requestClose();
  }, [story, onDeleted, requestClose]);

  // If the tray becomes empty (e.g. refetch), close.
  useEffect(() => {
    if (!story) requestClose();
  }, [story, requestClose]);

  // ── navigation ──
  const goAdvance = useCallback(() => {
    setProgress(0);
    setCursor((c) => {
      const next = advance(c, navAuthors);
      if (!next) {
        requestClose();
        return c;
      }
      return next;
    });
  }, [navAuthors, requestClose]);

  const goRewind = useCallback(() => {
    setProgress(0);
    setCursor((c) => rewind(c, navAuthors));
  }, [navAuthors]);

  const goJumpAuthor = useCallback(
    (dir: 1 | -1) => {
      setProgress(0);
      setCursor((c) => {
        const next = jumpAuthor(c, navAuthors, dir);
        if (!next) {
          requestClose();
          return c;
        }
        return next;
      });
    },
    [navAuthors, requestClose],
  );

  // Story is effectively paused while held OR while the viewers sheet is open.
  const effectivePaused = paused || viewersOpen;

  // Keep latest handlers in refs for the rAF/keyboard closures.
  const pausedRef = useRef(effectivePaused);
  pausedRef.current = effectivePaused;
  const advanceRef = useRef(goAdvance);
  advanceRef.current = goAdvance;

  // ── image timing (rAF); video timing comes from StoryContent events ──
  useEffect(() => {
    if (!story || story.mediaType !== 'image') {
      setProgress(0);
      return;
    }
    const duration = story.durationMs ?? IMAGE_DEFAULT_DURATION_MS;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    setProgress(0);
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current) {
        elapsed += dt;
        const p = elapsed / duration;
        setProgress(p);
        if (p >= 1) {
          advanceRef.current();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story?.id, story?.mediaType, story?.durationMs]);

  // ── record view (after dwell) ──
  useEffect(() => {
    if (!story || !entry) return;
    const t = setTimeout(() => {
      recordStoryView(story.id, currentUid, entry.authorId).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [story?.id, entry?.authorId, currentUid]);

  // ── mark author seen on open / author change ──
  useEffect(() => {
    if (!entry) return;
    const latest = entry.stories[entry.stories.length - 1];
    if (latest) {
      markAuthorSeen(currentUid, entry.authorId, latest.id, new Date(latest.createdAt)).catch(() => {});
      onSeen(entry.authorId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.authorIndex]);

  // ── preload next 1–2 media ──
  const preloadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const flat: { ai: number; si: number; url: string; type: string }[] = [];
    tray.forEach((e, ai) => e.stories.forEach((s, si) => flat.push({ ai, si, url: s.mediaUrl, type: s.mediaType })));
    const pos = flat.findIndex((f) => f.ai === cursor.authorIndex && f.si === cursor.storyIndex);
    for (const k of [1, 2]) {
      const nxt = flat[pos + k];
      if (!nxt || preloadedRef.current.has(nxt.url)) continue;
      preloadedRef.current.add(nxt.url);
      if (nxt.type === 'image') {
        const img = new Image();
        img.src = nxt.url;
      } else if (k === 1) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'video';
        link.href = nxt.url;
        document.head.appendChild(link);
      }
    }
  }, [cursor.authorIndex, cursor.storyIndex, tray]);

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goAdvance();
      else if (e.key === 'ArrowLeft') goRewind();
      else if (e.key === 'Escape') requestClose();
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goAdvance, goRewind, requestClose]);

  // ── gesture surface ──
  const cardRef = useRef<HTMLDivElement>(null);

  // ── hold-to-pause bookkeeping ──
  const holdTimer = useRef<number | null>(null);
  const holdActive = useRef(false);
  const clearHold = () => {
    if (holdTimer.current != null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const onTapStart = () => {
    holdActive.current = false;
    holdTimer.current = window.setTimeout(() => {
      holdActive.current = true;
      setPaused(true);
    }, HOLD_MS);
  };
  const onTap = (_e: unknown, info: { point: { x: number } }) => {
    clearHold();
    if (holdActive.current) {
      holdActive.current = false;
      setPaused(false);
      return;
    }
    // Zone is relative to the card (correct on desktop's centered card and on touch).
    const rect = cardRef.current?.getBoundingClientRect();
    const rel = rect && rect.width > 0 ? (info.point.x - rect.left) / rect.width : 0.5;
    if (rel < 0.33) goRewind();
    else goAdvance();
  };
  const onTapCancel = () => {
    clearHold();
    if (holdActive.current) {
      holdActive.current = false;
      setPaused(false);
    }
  };

  if (!story || !entry) return null;

  const overlay = (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black touch-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        ref={cardRef}
        className="relative w-full h-full sm:max-w-[440px] sm:h-[92vh] sm:rounded-2xl overflow-hidden bg-black shadow-2xl"
        drag
        dragElastic={0.6}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragSnapToOrigin
        onDragEnd={(_e, info) => {
          if (info.offset.y > SWIPE_CLOSE_PX || info.velocity.y > 700) {
            requestClose();
          } else if (info.offset.x < -SWIPE_AUTHOR_PX) {
            goJumpAuthor(1);
          } else if (info.offset.x > SWIPE_AUTHOR_PX) {
            goJumpAuthor(-1);
          }
        }}
        onTapStart={onTapStart as unknown as (e: MouseEvent | TouchEvent | PointerEvent) => void}
        onTap={onTap as unknown as (e: MouseEvent | TouchEvent | PointerEvent) => void}
        onTapCancel={onTapCancel}
      >
        <StoryContent
          key={story.id}
          story={story}
          paused={effectivePaused}
          muted={muted}
          onProgress={setProgress}
          onEnded={goAdvance}
          onError={() => {
            // Don't let a broken story wedge the viewer.
            window.setTimeout(() => advanceRef.current(), 600);
          }}
          onRequireMute={() => setMuted(true)}
        />

        {/* Top scrim + chrome */}
        <div className="absolute top-0 inset-x-0 p-3 pb-8 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <StoryProgressBars count={entry.stories.length} activeIndex={cursor.storyIndex} activeProgress={progress} />

          <div
            className="flex items-center gap-2.5 mt-3 pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white/15 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {entry.photoURL ? (
                <img src={getOptimizedImageUrl(entry.photoURL)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (entry.username?.charAt(0) || '?').toUpperCase()
              )}
            </div>
            <span className="text-white text-sm font-semibold drop-shadow">{entry.username}</span>
            <span className="text-white/70 text-xs drop-shadow">{timeAgo(story.createdAt)}</span>

            <div className="ml-auto flex items-center gap-1">
              {story.mediaType === 'video' && (
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="w-9 h-9 flex items-center justify-center text-white/90 hover:text-white"
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
              )}
              <button
                type="button"
                onClick={requestClose}
                className="w-9 h-9 flex items-center justify-center text-white/90 hover:text-white"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>

        {/* Owner tools (own story only) */}
        {entry.authorId === currentUid && (
          <StoryOwnerBar storyId={story.id} onOpenViewers={() => setViewersOpen(true)} onDelete={handleDelete} />
        )}

        <AnimatePresence>
          {viewersOpen && <StoryViewersSheet storyId={story.id} onClose={() => setViewersOpen(false)} />}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );

  return createPortal(overlay, document.body);
}
