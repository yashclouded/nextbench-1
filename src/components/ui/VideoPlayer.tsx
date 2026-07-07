import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Volume1, Maximize, Minimize, RotateCcw } from 'lucide-react';
import { useVideoPrefs } from '../../lib/VideoPrefsContext';

interface VideoPlayerProps {
  src: string;
  poster?: string;
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

// Default volume level (0–1). Not too quiet, not too loud.
const DEFAULT_VOLUME = 0.5;

export default function VideoPlayer({ src, poster, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Unique ID for this player so it can ignore its own unmute broadcast
  const playerIdRef = useRef(`vp-${Math.random().toString(36).slice(2)}`);

  const { globalMuted, setGlobalMuted } = useVideoPrefs();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(globalMuted);
  const [volume, setVolume] = useState(() => {
    try {
      const stored = localStorage.getItem('nextbench-video-volume');
      if (stored !== null) {
        const v = parseFloat(stored);
        if (isFinite(v) && v >= 0 && v <= 1) return v;
      }
    } catch { /* ignore */ }
    return DEFAULT_VOLUME;
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  // True when this video is ≥40% visible in the viewport
  const [isInView, setIsInView] = useState(false);
  // Poster frame extracted from the video itself
  const [generatedPoster, setGeneratedPoster] = useState<string | null>(null);
  // Track whether the video element has loaded enough to show a frame
  const [videoReady, setVideoReady] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Volume icon picker
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // ─── Generate poster frame from video ─────────────────────────────────────
  // If no explicit poster prop is provided, extract the first frame from the video.
  useEffect(() => {
    if (poster) return; // Use explicit poster if available
    
    const extractPoster = () => {
      const tempVideo = document.createElement('video');
      tempVideo.crossOrigin = 'anonymous';
      tempVideo.preload = 'metadata';
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      // Seek to 0.5s for a representative frame (avoids solid-color first frames)
      tempVideo.src = src + '#t=0.5';
      
      const onSeeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = tempVideo.videoWidth || 640;
          canvas.height = tempVideo.videoHeight || 360;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            // Only set if we got a valid image (not a blank canvas)
            if (dataUrl && dataUrl.length > 100) {
              setGeneratedPoster(dataUrl);
            }
          }
        } catch {
          // Cross-origin or security error — fall back to no poster
        }
        tempVideo.removeEventListener('seeked', onSeeked);
        tempVideo.src = '';
        tempVideo.load();
      };

      tempVideo.addEventListener('loadeddata', () => {
        tempVideo.currentTime = 0.5;
      }, { once: true });
      tempVideo.addEventListener('seeked', onSeeked, { once: true });
      tempVideo.addEventListener('error', () => {
        // Silently fail — poster is a nice-to-have
        tempVideo.src = '';
      }, { once: true });

      tempVideo.load();
    };

    extractPoster();
  }, [src, poster]);

  const effectivePoster = poster || generatedPoster;

  // ─── Auto-hide controls ──────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    setShowControls(true);
    if (isPlaying && hasStarted) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
        setShowVolumeSlider(false);
      }, 2500);
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
      video.volume = volume;
      // Only autoplay if already visible; off-screen videos stay paused
      if (isInView) {
        video.play()
          .then(() => setHasStarted(true))
          .catch(() => setHasStarted(false));
      } else {
        setHasStarted(false);
      }
    };
    const onLoadedData = () => {
      // Video has loaded enough to display a frame — trigger smooth reveal
      setVideoReady(true);
    };
    const onPlay = () => { setIsPlaying(true); setHasEnded(false); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setHasEnded(true); setShowControls(true); };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => {
      setIsLoading(false);
      setVideoReady(true);
    };
    const onProgress = () => {
      if (video.buffered.length > 0)
        setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
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
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('progress', onProgress);
    };
  }, [isInView, volume]);

  // ─── Fullscreen detection ────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ─── Persist volume to localStorage ──────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('nextbench-video-volume', String(volume)); } catch { /* ignore */ }
  }, [volume]);

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
      // Restore volume when unmuting (in case it was 0)
      if (video.volume === 0) {
        video.volume = DEFAULT_VOLUME;
        setVolume(DEFAULT_VOLUME);
      }
      // Tell all other players to mute
      document.dispatchEvent(
        new CustomEvent(UNMUTE_EVENT, { detail: { playerId: playerIdRef.current } })
      );
    }
  };

  // Sync whenever another video player changes the global mute preference
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = globalMuted;
    setIsMuted(globalMuted);
  }, [globalMuted]);

  const handleVolumeChange = (e: React.MouseEvent) => {
    e.stopPropagation();
    const bar = volumeRef.current;
    const video = videoRef.current;
    if (!bar || !video) return;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newVolume = Math.round(pos * 100) / 100;
    setVolume(newVolume);
    video.volume = newVolume;
    if (newVolume > 0 && video.muted) {
      video.muted = false;
      setIsMuted(false);
      document.dispatchEvent(
        new CustomEvent(UNMUTE_EVENT, { detail: { playerId: playerIdRef.current } })
      );
    } else if (newVolume === 0) {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleVolumeChange(e);
    const onMove = (ev: MouseEvent) => {
      ev.stopPropagation();
      const bar = volumeRef.current;
      const video = videoRef.current;
      if (!bar || !video) return;
      const rect = bar.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const newVolume = Math.round(pos * 100) / 100;
      setVolume(newVolume);
      video.volume = newVolume;
      if (newVolume > 0 && video.muted) {
        video.muted = false;
        setIsMuted(false);
      } else if (newVolume === 0) {
        video.muted = true;
        setIsMuted(true);
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
      onMouseLeave={() => { if (isPlaying && hasStarted) { setShowControls(false); setShowVolumeSlider(false); } }}
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      {/* Cover/poster image — shown while video is loading (Instagram-style) */}
      {effectivePoster && !videoReady && (
        <img
          src={effectivePoster}
          alt=""
          className="absolute inset-0 w-full h-full object-contain z-[1] pointer-events-none"
          draggable={false}
        />
      )}

      {/* Video element — fades in once loaded */}
      <video
        ref={videoRef}
        src={src + '#t=0.1'}
        playsInline
        muted={isMuted}
        preload="metadata"
        className={`w-full h-auto transition-opacity duration-500 ease-out ${
          isFullscreen ? 'max-h-screen object-contain' : 'max-h-[70vh] object-contain'
        } ${videoReady ? 'opacity-100' : 'opacity-0'}`}
        style={{ zIndex: 2 }}
      />

      {/* Loading spinner — only when buffering mid-playback or initial load */}
      {isLoading && (hasStarted || !effectivePoster) && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Subtle loading shimmer over poster while video loads */}
      {!videoReady && effectivePoster && (
        <div className="absolute inset-0 z-[3] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
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

                {/* Volume control group */}
                <div
                  className="flex items-center gap-1 group/vol"
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  onMouseLeave={() => setShowVolumeSlider(false)}
                >
                  <button onClick={toggleMute} className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 transition-colors text-white">
                    <VolumeIcon size={16} />
                  </button>
                  {/* Volume slider — expands on hover */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-out ${
                      showVolumeSlider ? 'w-20 sm:w-24 opacity-100' : 'w-0 opacity-0'
                    }`}
                  >
                    <div
                      ref={volumeRef}
                      className="w-20 sm:w-24 h-1 bg-white/20 rounded-full cursor-pointer relative group/volbar hover:h-1.5 transition-all"
                      onMouseDown={handleVolumeMouseDown}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className="h-full bg-white rounded-full relative pointer-events-none"
                        style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-md opacity-0 group-hover/volbar:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>
                </div>

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
