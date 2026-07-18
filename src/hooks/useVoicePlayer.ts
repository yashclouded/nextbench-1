/**
 * useVoicePlayer — Custom hook for voice message playback.
 *
 * Features:
 * - Singleton pattern: only one voice message plays at a time
 * - Lazy Audio element creation (only on play)
 * - Speed cycling (1x → 1.5x → 2x)
 * - Seek support via progress bar
 * - Proper cleanup on unmount
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/** Module-level singleton tracker — stops previous audio when a new one starts */
let currentlyPlayingStop: (() => void) | null = null;

export interface UseVoicePlayerReturn {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  error: string | null;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  toggleSpeed: () => void;
  retry: () => void;
  destroy: () => void;
}

const SPEED_OPTIONS = [1, 1.5, 2];

export function useVoicePlayer(audioUrl: string): UseVoicePlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const urlRef = useRef(audioUrl);
  // Last currentTime we pushed to React state — lets the rAF loop skip renders
  // when the change is imperceptible, so playback doesn't re-render 28 waveform
  // bars 60×/sec (the source of the jank).
  const lastPushedTimeRef = useRef(0);

  // Keep urlRef in sync
  useEffect(() => {
    urlRef.current = audioUrl;
  }, [audioUrl]);

  /** Update current time via requestAnimationFrame for smooth progress */
  const startTimeUpdate = useCallback(() => {
    const update = () => {
      if (audioRef.current) {
        const t = audioRef.current.currentTime;
        // Throttle: only re-render when the bar/progress would visibly move.
        if (Math.abs(t - lastPushedTimeRef.current) >= 0.1) {
          lastPushedTimeRef.current = t;
          setCurrentTime(t);
        }
      }
      animFrameRef.current = requestAnimationFrame(update);
    };
    animFrameRef.current = requestAnimationFrame(update);
  }, []);

  const stopTimeUpdate = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  /** Destroy the Audio element and cleanup */
  const destroy = useCallback(() => {
    stopTimeUpdate();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
    setCurrentTime(0);
    lastPushedTimeRef.current = 0;
  }, [stopTimeUpdate]);

  /** Cleanup on unmount */
  useEffect(() => {
    return () => {
      // If this instance is the currently playing one, clear the singleton
      if (currentlyPlayingStop === stopPlaybackForSingleton) {
        currentlyPlayingStop = null;
      }
      destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Singleton stop function for this instance */
  const stopPlaybackForSingleton = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopTimeUpdate();
    setIsPlaying(false);
  }, [stopTimeUpdate]);

  /** Create or get Audio element */
  const getOrCreateAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio();
    audio.preload = 'none';

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setIsLoading(false);
    });

    audio.addEventListener('canplaythrough', () => {
      setIsLoading(false);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
      lastPushedTimeRef.current = 0;
      stopTimeUpdate();
      audio.currentTime = 0;
      if (currentlyPlayingStop === stopPlaybackForSingleton) {
        currentlyPlayingStop = null;
      }
    });

    audio.addEventListener('error', () => {
      setError('Unable to load voice message.');
      setIsLoading(false);
      setIsPlaying(false);
      stopTimeUpdate();
    });

    audio.addEventListener('waiting', () => {
      setIsLoading(true);
    });

    audio.addEventListener('playing', () => {
      setIsLoading(false);
    });

    audioRef.current = audio;
    return audio;
  }, [stopTimeUpdate, stopPlaybackForSingleton]);

  /** Play audio */
  const play = useCallback(() => {
    if (!audioUrl) return;

    // Stop any currently playing voice message (singleton)
    if (currentlyPlayingStop && currentlyPlayingStop !== stopPlaybackForSingleton) {
      currentlyPlayingStop();
    }

    setError(null);
    const audio = getOrCreateAudio();

    // If audio hasn't been loaded yet, set the src
    if (!audio.src || audio.src !== audioUrl) {
      setIsLoading(true);
      audio.src = audioUrl;
      audio.load();
    }

    audio.playbackRate = playbackRate;

    audio.play().then(() => {
      setIsPlaying(true);
      startTimeUpdate();
      currentlyPlayingStop = stopPlaybackForSingleton;
    }).catch((err) => {
      console.error('Playback failed:', err);
      setError('Unable to play voice message.');
      setIsLoading(false);
    });
  }, [audioUrl, playbackRate, getOrCreateAudio, startTimeUpdate, stopPlaybackForSingleton]);

  /** Pause audio */
  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopTimeUpdate();
    setIsPlaying(false);
  }, [stopTimeUpdate]);

  /** Toggle play/pause */
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  /** Seek to specific time */
  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      lastPushedTimeRef.current = time;
      setCurrentTime(time);
    }
  }, []);

  /** Cycle playback speed */
  const toggleSpeed = useCallback(() => {
    setPlaybackRate(prev => {
      const currentIndex = SPEED_OPTIONS.indexOf(prev);
      const nextRate = SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length];
      if (audioRef.current) {
        audioRef.current.playbackRate = nextRate;
      }
      return nextRate;
    });
  }, []);

  /** Retry loading audio after error */
  const retry = useCallback(() => {
    setError(null);
    destroy();
    // Recreate and play
    play();
  }, [destroy, play]);

  return {
    isPlaying,
    isLoading,
    currentTime,
    duration,
    playbackRate,
    error,
    play,
    pause,
    togglePlayPause,
    seek,
    toggleSpeed,
    retry,
    destroy,
  };
}

/**
 * Call this to stop any currently playing voice message globally.
 * Useful when starting a new recording.
 */
export function stopAllVoicePlayback(): void {
  if (currentlyPlayingStop) {
    currentlyPlayingStop();
    currentlyPlayingStop = null;
  }
}
