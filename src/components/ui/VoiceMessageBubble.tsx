/**
 * VoiceMessageBubble — Custom audio player UI for voice messages in chat.
 *
 * Features:
 * - Play/Pause toggle
 * - Clickable progress bar with seek
 * - Current time / total duration display
 * - Playback speed toggle (1x → 1.5x → 2x)
 * - Loading spinner while audio loads
 * - Error state with retry
 * - Upload progress indicator for pending messages
 * - Decorative waveform visualization
 */

import React, { useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Loader2 } from 'lucide-react';
import { useVoicePlayer } from '../../hooks/useVoicePlayer';

interface VoiceMessageBubbleProps {
  audioUrl: string;
  duration: number;
  isSent: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  onRetryUpload?: () => void;
  uploadError?: string | null;
}

/** Format seconds as M:SS */
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Deterministic pseudo-random bar heights for the decorative waveform. Static,
// so it lives at module scope instead of being rebuilt on every playback render.
const WAVEFORM_HEIGHTS = [40, 65, 85, 50, 95, 70, 55, 90, 45, 75, 60, 100, 50, 80, 65, 95, 55, 70, 85, 45, 90, 60, 75, 50, 80, 95, 65, 70];

const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({
  audioUrl,
  duration: totalDuration,
  isSent,
  isUploading = false,
  uploadProgress = 0,
  onRetryUpload,
  uploadError,
}) => {
  const progressRef = useRef<HTMLDivElement>(null);

  const {
    isPlaying,
    isLoading,
    currentTime,
    duration: audioDuration,
    playbackRate,
    error,
    togglePlayPause,
    seek,
    toggleSpeed,
    retry,
  } = useVoicePlayer(audioUrl);

  // Use audioDuration from player if available, else fallback to prop
  const displayDuration = audioDuration > 0 ? audioDuration : totalDuration;
  const progress = displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0;

  /** Handle progress bar click for seeking */
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || displayDuration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    seek(pct * displayDuration);
  }, [displayDuration, seek]);

  // ── Upload state ──
  if (isUploading) {
    return (
      <div
        className="voice-message-bubble"
        role="group"
        aria-label="Voice message uploading"
      >
        <div className="voice-upload-state">
          <Loader2 size={18} className="voice-spinner" />
          <span className="voice-upload-text">
            Uploading... {uploadProgress}%
          </span>
          <div className="voice-upload-track">
            <div
              className="voice-upload-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Upload error state ──
  if (uploadError) {
    return (
      <div
        className="voice-message-bubble"
        role="group"
        aria-label="Voice message failed to send"
      >
        <div className="voice-error-state">
          <span className="voice-error-text">Failed to send</span>
          {onRetryUpload && (
            <button
              onClick={onRetryUpload}
              className="voice-retry-btn"
              aria-label="Retry sending voice message"
            >
              <RotateCcw size={14} />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Playback error state ──
  if (error) {
    return (
      <div
        className="voice-message-bubble"
        role="group"
        aria-label="Voice message error"
      >
        <div className="voice-error-state">
          <span className="voice-error-text">{error}</span>
          <button
            onClick={retry}
            className="voice-retry-btn"
            aria-label="Retry loading voice message"
          >
            <RotateCcw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Normal player ──
  return (
    <div
      className={`voice-message-bubble ${isSent ? 'voice-sent' : 'voice-received'}`}
      role="group"
      aria-label={`Voice message, ${formatTime(displayDuration)} long`}
    >
      {/* Play/Pause button */}
      <button
        onClick={togglePlayPause}
        className={`voice-play-btn ${isSent ? 'voice-play-sent' : 'voice-play-received'}`}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 size={18} className="voice-spinner" />
        ) : isPlaying ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
        )}
      </button>

      {/* Waveform + progress area */}
      <div className="voice-content">
        {/* Decorative waveform / progress bar */}
        <div
          ref={progressRef}
          className="voice-progress-container"
          onClick={handleProgressClick}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={displayDuration}
          aria-valuenow={currentTime}
          aria-label="Audio playback progress"
          tabIndex={0}
        >
          {/* Waveform bars (decorative) */}
          <div className="voice-waveform" aria-hidden="true">
            {Array.from({ length: 28 }).map((_, i) => {
              const barProgress = (i / 28) * 100;
              const isActive = barProgress <= progress;
              const height = WAVEFORM_HEIGHTS[i % WAVEFORM_HEIGHTS.length];
              return (
                <div
                  key={i}
                  className={`voice-waveform-bar ${isActive ? (isSent ? 'bar-active-sent' : 'bar-active-received') : 'bar-inactive'}`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
        </div>

        {/* Time + speed row */}
        <div className="voice-meta-row">
          <span className="voice-time">
            {isPlaying || currentTime > 0
              ? `${formatTime(currentTime)} / ${formatTime(displayDuration)}`
              : formatTime(displayDuration)
            }
          </span>
          <button
            onClick={toggleSpeed}
            className={`voice-speed-btn ${isSent ? 'voice-speed-sent' : 'voice-speed-received'}`}
            aria-label={`Playback speed: ${playbackRate}x`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceMessageBubble;
