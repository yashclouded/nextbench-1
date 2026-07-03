/**
 * Renders a single story's media (image or video) inside the 9:16 story box, with its
 * structured layers overlaid. Memoized so the viewer's per-frame progress updates don't
 * re-render the media. Reports load/error, and (for video) playback progress + end.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Story } from '../../lib/stories';
import StoryLayerRenderer from './StoryLayerRenderer';

interface Props {
  story: Story;
  paused: boolean;
  muted: boolean;
  /** video only: 0..1 playback fraction */
  onProgress?: (p: number) => void;
  /** video only */
  onEnded?: () => void;
  onLoaded?: () => void;
  onError?: () => void;
  /** called when unmuted autoplay is blocked, so the viewer can fall back to muted */
  onRequireMute?: () => void;
}

function StoryContent({ story, paused, muted, onProgress, onEnded, onLoaded, onError, onRequireMute }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  // Measure the story box so layers can be positioned from normalized coords.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Play/pause the video in response to the paused prop, handling autoplay-with-sound.
  useEffect(() => {
    if (story.mediaType !== 'video') return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (paused) {
      v.pause();
      return;
    }
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Autoplay with sound was blocked → retry muted and let the viewer show unmute.
        if (!muted) {
          v.muted = true;
          onRequireMute?.();
          v.play().catch(() => {});
        }
      });
    }
  }, [story.mediaType, story.id, paused, muted, onRequireMute]);

  return (
    <div ref={boxRef} className="relative w-full h-full overflow-hidden bg-black">
      {story.mediaType === 'video' ? (
        <video
          ref={videoRef}
          src={story.mediaUrl}
          poster={story.posterUrl ?? undefined}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          autoPlay
          muted={muted}
          onLoadedMetadata={onLoaded}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (v && v.duration > 0 && onProgress) onProgress(v.currentTime / v.duration);
          }}
          onEnded={onEnded}
          onError={onError}
        />
      ) : (
        <img
          src={story.mediaUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={onLoaded}
          onError={onError}
        />
      )}

      <StoryLayerRenderer layers={story.layers} width={box.width} height={box.height} />
    </div>
  );
}

export default memo(StoryContent);
