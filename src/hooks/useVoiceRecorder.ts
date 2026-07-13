/**
 * useVoiceRecorder — Custom hook for voice message recording.
 *
 * Uses the native MediaRecorder API to record audio in webm format.
 * Handles microphone permissions, live timer, auto-stop at 5 minutes,
 * and blob validation (min 1 second, non-empty).
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_DURATION_SECONDS = 300; // 5 minutes
const MIN_DURATION_SECONDS = 1;

/** Format seconds as MM:SS */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Detect best supported audio MIME type */
function getSupportedMimeType(): string {
  const types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return ''; // Let browser pick default
}

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  duration: number;
  audioBlob: Blob | null;
  error: string | null;
  permissionDenied: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  clearBlob: () => void;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const isStoppingRef = useRef(false);

  /** Clean up media stream tracks */
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  /** Stop the duration timer */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Full cleanup on unmount */
  useEffect(() => {
    return () => {
      stopTimer();
      cleanupStream();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, [stopTimer, cleanupStream]);

  /** Start recording */
  const startRecording = useCallback(async () => {
    // Check browser support
    if (typeof MediaRecorder === 'undefined') {
      setError('Your browser does not support audio recording.');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Your browser does not support microphone access.');
      return;
    }

    // Don't re-prompt after denial
    if (permissionDenied) {
      setError('Microphone permission is required to send voice messages.');
      return;
    }

    // Reset state
    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];
    durationRef.current = 0;
    setDuration(0);
    isStoppingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = {};
      if (mimeType) options.mimeType = mimeType;

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stopTimer();

        if (isStoppingRef.current) {
          // Recording was cancelled — don't produce a blob
          cleanupStream();
          return;
        }

        const finalDuration = durationRef.current;

        // Validate minimum duration
        if (finalDuration < MIN_DURATION_SECONDS) {
          setError('Recording is too short. Hold for at least 1 second.');
          chunksRef.current = [];
          cleanupStream();
          return;
        }

        // Assemble blob
        const recordedMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        chunksRef.current = [];

        // Validate blob
        if (!blob || blob.size === 0) {
          setError('Recording failed. Please try again.');
          cleanupStream();
          return;
        }

        setAudioBlob(blob);
        cleanupStream();
      };

      recorder.onerror = () => {
        setError('Recording error. Please try again.');
        setIsRecording(false);
        stopTimer();
        cleanupStream();
      };

      // Request data every second for progressive chunk collection
      recorder.start(1000);
      setIsRecording(true);

      // Start the timer
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);

        // Auto-stop at max duration
        if (durationRef.current >= MAX_DURATION_SECONDS) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
          }
        }
      }, 1000);

    } catch (err: any) {
      cleanupStream();

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setError('Microphone permission is required to send voice messages.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Microphone is in use by another application.');
      } else {
        setError('Could not access microphone. Please try again.');
      }
    }
  }, [permissionDenied, cleanupStream, stopTimer]);

  /** Stop recording and produce blob */
  const stopRecording = useCallback(() => {
    isStoppingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  /** Cancel recording and discard data */
  const cancelRecording = useCallback(() => {
    isStoppingRef.current = true;
    chunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setDuration(0);
    durationRef.current = 0;
    stopTimer();
    cleanupStream();
    setAudioBlob(null);
    setError(null);
  }, [stopTimer, cleanupStream]);

  /** Clear blob after it's been consumed by upload */
  const clearBlob = useCallback(() => {
    setAudioBlob(null);
    setDuration(0);
    durationRef.current = 0;
  }, []);

  return {
    isRecording,
    duration,
    audioBlob,
    error,
    permissionDenied,
    startRecording,
    stopRecording,
    cancelRecording,
    clearBlob,
  };
}
