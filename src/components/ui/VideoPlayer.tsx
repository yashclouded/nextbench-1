import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── Global single-unmute event ──────────────────────────────────────────────
// When any VideoPlayer unmutes, it broadcasts this custom event on `document`.
// Every other mounted VideoPlayer hears it and re-mutes itself — ensuring only
// ONE video ever has audio playing at a time across the entire feed.
const UNMUTE_EVENT = 'nextbench:video-unmuted';

export default function VideoPlayer({ src, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Unique ID for this player so it can ignore its own unmute broadcast
  const playerIdRef = useRef(`vp-${Math.random().toString(36).slice(2)}`);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  // True when this video is ≥40% visible in the viewport
  const [isInView, setIsInView] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ─── Auto-hide controls ──────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    setShowControls(true);
    if (isPlaying && hasStarted) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [isPlaying, hasStarted]);

  useEffect(() => {
    return () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); };
  }, []);

  useEffect(() => {
    if (!isPlaying || !hasStarted) {
      setShowControls(true);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    } else {
      resetHideTimer();
    }
  }, [isPlaying, hasStarted, resetHideTimer]);

  // ─── Viewport detection — only play the visible video ───────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.4),
      { threshold: [0, 0.4, 1.0] }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Play when scrolled into view, pause when scrolled out
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasStarted) return;
    if (isInView) {
      if (video.paused && !hasEnded) video.play().catch(() => {});
    } else {
      if (!video.paused) video.pause();
    }
  }, [isInView, hasStarted, hasEnded]);

  // ─── Single-unmute enforcement ───────────────────────────────────────────
  // When another player dispatches UNMUTE_EVENT, re-mute this one.
  useEffect(() => {
    const onOtherUnmuted = (e: Event) => {
      const { playerId } = (e as CustomEvent<{ playerId: string }>).detail;
      if (playerId === playerIdRef.current) return; // ignore self
      const video = videoRef.current;
      if (video && !video.muted) { video.muted = true; setIsMuted(true); }
    };
    document.addEventListener(UNMUTE_EVENT, onOtherUnmuted);
    return () => document.removeEventListener(UNMUTE_EVENT, onOtherUnmuted);
  }, []);

  // ─── Video event listeners ───────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
      video.muted = true;
      setIsMuted(true);
      // Only autoplay if already visible; off-screen videos stay paused
      if (isInView) {
        video.play()
          .then(() => setHasStarted(true))
          .catch(() => setHasStarted(false));
      } else {
        setHasStarted(false);
      }
    };
    const onPlay = () => { setIsPlaying(true); setHasEnded(false); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setHasEnded(true); setShowControls(true); };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onProgress = () => {
      if (video.buffered.length > 0)
        setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('progress', onProgress);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('progress', onProgress);
    };
  }, [isInView]);

  // ─── Fullscreen detection ────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ─── Controls ────────────────────────────────────────────────────────────
  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (hasEnded) { video.currentTime = 0; setHasEnded(false); }
    if (video.paused) { video.play(); setHasStarted(true); } else { video.pause(); }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const willUnmute = video.muted; // true means we're about to unmute
    video.muted = !video.muted;
    setIsMuted(video.muted);
    if (willUnmute) {
      // Tell all other players to mute
      document.dispatchEvent(
        new CustomEvent(UNMUTE_EVENT, { detail: { playerId: playerIdRef.current } })
      );
    }
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current.requestFullscreen();
  };

  const handleProgressClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pos * video.duration;
  };

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSeeking(true);
    handleProgressClick(e);
    const onMove = (ev: MouseEvent) => {
      const video = videoRef.current;
      const bar = progressRef.current;
      if (!video || !bar) return;
      const rect = bar.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      video.currentTime = pos * video.duration;
    };
    const onUp = () => {
      setIsSeeking(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={containerRef}
      className={`relative group bg-black overflow-hidden select-none ${isFullscreen ? '' : 'rounded-[20px]'} ${className}`}
      onClick={togglePlay}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (isPlaying && hasStarted) setShowControls(false); }}
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src + '#t=1'}
        playsInline
        muted={isMuted}
        preload="metadata"
        className={`w-full h-auto ${isFullscreen ? 'max-h-screen object-contain' : 'max-h-[70vh] object-contain'}`}
      />

      {/* Loading spinner */}
      {isLoading && hasStarted && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Play button — shown before first play or when out of viewport */}
      {!hasStarted && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/20 backdrop-blur-[1px]">
          <button
            onClick={togglePlay}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 hover:bg-white hover:scale-110 transition-all duration-200 flex items-center justify-center shadow-2xl shadow-black/30"
          >
            <Play size={28} className="text-gray-900 ml-1" fill="currentColor" />
          </button>
        </div>
      )}

      {/* Replay overlay */}
      {hasEnded && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40 backdrop-blur-sm">
          <button
            onClick={togglePlay}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 hover:bg-white hover:scale-110 transition-all duration-200 flex items-center justify-center shadow-2xl shadow-black/30"
          >
            <RotateCcw size={24} className="text-gray-900" />
          </button>
        </div>
      )}

      {/* Bottom controls bar */}
      {hasStarted && !hasEnded && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300 ${showControls || !isPlaying || isSeeking ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
          <div className="relative px-3 sm:px-4 pb-3 sm:pb-4 pt-8">
            {/* Progress bar */}
            <div
              ref={progressRef}
              className="w-full h-1.5 sm:h-1 bg-white/20 rounded-full cursor-pointer mb-2.5 sm:mb-3 group/progress hover:h-2 transition-all"
              onMouseDown={handleProgressMouseDown}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute h-full bg-white/25 rounded-full pointer-events-none" style={{ width: `${buffered}%` }} />
              <div className="h-full bg-white rounded-full relative pointer-events-none" style={{ width: `${progress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button onClick={togglePlay} className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 transition-colors text-white">
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                </button>
                <button onClick={toggleMute} className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 transition-colors text-white">
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <span className="text-[11px] sm:text-xs text-white/80 font-mono tabular-nums ml-1">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <button onClick={toggleFullscreen} className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 transition-colors text-white">
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
