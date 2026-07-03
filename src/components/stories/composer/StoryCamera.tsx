/**
 * Basic in-app camera for mobile: live preview, tap-to-capture photo, tap-to-toggle video
 * recording (auto-stops at the limit), and front/back flip. Returns a File to the composer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Circle, Square } from 'lucide-react';
import { MAX_VIDEO_MS } from '../../../lib/storyMedia';

interface Props {
  onCapture: (file: File, mediaType: 'image' | 'video') => void;
  onClose: () => void;
}

type Facing = 'user' | 'environment';

function pickMimeType(): string {
  const candidates = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'video/webm';
}

export default function StoryCamera({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const autoStopRef = useRef<number | null>(null);

  const [facing, setFacing] = useState<Facing>('environment');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // (Re)start the stream when facing or mode changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: mode === 'video',
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setError(null);
      } catch {
        if (!cancelled) setError('Camera unavailable. Check permissions or use the library instead.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facing, mode, stopStream]);

  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      stopStream();
    };
  }, [stopStream]);

  const capturePhoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        onCapture(new File([blob], 'story.jpg', { type: 'image/jpeg' }), 'image');
      },
      'image/jpeg',
      0.92,
    );
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      stopStream();
      onCapture(new File([blob], `story.${ext}`, { type: mimeType }), 'video');
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
    autoStopRef.current = window.setTimeout(() => stopRecording(), MAX_VIDEO_MS);
  };

  const stopRecording = () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const onShutter = () => {
    if (mode === 'photo') capturePhoto();
    else if (recording) stopRecording();
    else startRecording();
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4 z-10">
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center">
          <X size={24} />
        </button>
        {!recording && (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            aria-label="Flip camera"
            className="w-9 h-9 flex items-center justify-center"
          >
            <RefreshCw size={20} />
          </button>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-white/80">{error}</div>
        ) : (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
            playsInline
            muted
            autoPlay
          />
        )}
      </div>

      {!error && (
        <div className="p-6 flex flex-col items-center gap-4">
          {/* mode toggle */}
          {!recording && (
            <div className="flex gap-2 text-sm">
              {(['photo', 'video'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 rounded-full capitalize ${mode === m ? 'bg-white text-black font-semibold' : 'text-white/70'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onShutter}
            aria-label={mode === 'photo' ? 'Capture photo' : recording ? 'Stop recording' : 'Start recording'}
            className="w-18 h-18 flex items-center justify-center rounded-full border-4 border-white"
            style={{ width: 72, height: 72 }}
          >
            {mode === 'video' && recording ? (
              <Square size={26} fill="#FF375F" color="#FF375F" />
            ) : (
              <Circle size={54} fill={mode === 'video' ? '#FF375F' : '#fff'} color={mode === 'video' ? '#FF375F' : '#fff'} />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
