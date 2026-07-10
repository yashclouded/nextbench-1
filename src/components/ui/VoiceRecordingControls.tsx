/**
 * VoiceRecordingControls — Recording state UI displayed in the chat input area.
 *
 * Shows an animated red pulse, live timer, and stop/cancel buttons
 * while a voice recording is in progress.
 */

import React from 'react';
import { motion } from 'motion/react';
import { Square, X } from 'lucide-react';
import { formatDuration } from '../../hooks/useVoiceRecorder';

interface VoiceRecordingControlsProps {
  duration: number;
  onStop: () => void;
  onCancel: () => void;
}

const VoiceRecordingControls: React.FC<VoiceRecordingControlsProps> = ({
  duration,
  onStop,
  onCancel,
}) => {
  const MAX_DURATION = 300;
  const progressPct = Math.min((duration / MAX_DURATION) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="voice-recording-controls"
    >
      {/* Recording indicator */}
      <div className="voice-recording-left">
        <span className="recording-pulse" aria-hidden="true" />
        <span className="voice-recording-label">Recording...</span>
      </div>

      {/* Timer */}
      <div className="voice-recording-center">
        <span className="recording-timer" aria-live="polite" aria-label={`Recording duration: ${formatDuration(duration)}`}>
          {formatDuration(duration)}
        </span>
        {/* Progress track */}
        <div className="voice-recording-progress-track">
          <div
            className="voice-recording-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="voice-recording-actions">
        <button
          type="button"
          onClick={onCancel}
          className="voice-recording-cancel-btn"
          aria-label="Cancel recording"
          title="Cancel"
        >
          <X size={18} />
        </button>
        <button
          type="button"
          onClick={onStop}
          className="voice-recording-stop-btn"
          aria-label="Stop recording and send"
          title="Stop & Send"
        >
          <Square size={14} fill="currentColor" />
          <span>Send</span>
        </button>
      </div>
    </motion.div>
  );
};

export default VoiceRecordingControls;
