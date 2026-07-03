/**
 * Story creation flow orchestrator. Opened by the row's "+". Steps:
 *   pick → (camera) → crop (images) → review → publish.
 * Owns the draft and its object URLs. Rendered via a body portal.
 *
 * (The text editor step is inserted between crop/video and review in Stage B.)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { useToast } from '../../../lib/ToastContext';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { isHeicFile, convertHeicToJpeg } from '../../../lib/heic-converter';
import type { Story, StoryPrivacy } from '../../../lib/stories';
import {
  compressImage,
  getVideoMeta,
  capturePoster,
  publishStory,
  isMobileCapture,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_MS,
  type StoryDraft,
} from '../../../lib/storyMedia';
import ImageCropper from '../../ui/ImageCropper';
import type { Layer } from '../../../lib/stories';
import StorySourcePicker from './StorySourcePicker';
import StoryCamera from './StoryCamera';
import StoryEditor from './StoryEditor';
import StoryReview from './StoryReview';

interface Props {
  onClose: () => void;
  onPublished: (story: Story) => void;
}

type Step = 'pick' | 'camera' | 'crop' | 'edit' | 'review';

const STORY_ASPECT = 9 / 16;

export default function StoryComposer({ onClose, onPublished }: Props) {
  useScrollLock(true);
  const { user, userData } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('pick');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Revoke object URLs on unmount.
  const imageSrcRef = useRef<string | null>(null);
  imageSrcRef.current = imageSrc;
  const draftUrlRef = useRef<string | null>(null);
  draftUrlRef.current = draft?.objectUrl ?? null;
  useEffect(() => {
    return () => {
      if (imageSrcRef.current) URL.revokeObjectURL(imageSrcRef.current);
      if (draftUrlRef.current) URL.revokeObjectURL(draftUrlRef.current);
    };
  }, []);

  const handleVideo = useCallback(
    async (file: File) => {
      if (file.size > MAX_VIDEO_BYTES) {
        showToast('Video is too large (max 100MB).', 'error');
        return;
      }
      setProcessing(true);
      const objectUrl = URL.createObjectURL(file);
      try {
        const meta = await getVideoMeta(objectUrl);
        if (meta.durationMs > MAX_VIDEO_MS + 500) {
          showToast('Video is too long (max 60s).', 'error');
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const poster = await capturePoster(objectUrl).catch(() => null);
        setDraft({
          blob: file,
          objectUrl,
          mediaType: 'video',
          width: meta.width,
          height: meta.height,
          durationMs: meta.durationMs,
          posterBlob: poster?.blob ?? null,
          layers: [],
          privacy: 'public',
        });
        setStep('edit');
      } catch {
        showToast('Could not process that video.', 'error');
        URL.revokeObjectURL(objectUrl);
      } finally {
        setProcessing(false);
      }
    },
    [showToast],
  );

  const handlePicked = useCallback(
    async (file: File) => {
      if (file.type.startsWith('video/')) {
        void handleVideo(file);
        return;
      }
      // image
      setProcessing(true);
      try {
        let imgFile: File = file;
        if (isHeicFile(file)) imgFile = await convertHeicToJpeg(file);
        const src = URL.createObjectURL(imgFile);
        if (imageSrc) URL.revokeObjectURL(imageSrc);
        setImageSrc(src);
        setStep('crop');
      } catch {
        showToast('Could not open that image.', 'error');
      } finally {
        setProcessing(false);
      }
    },
    [handleVideo, imageSrc, showToast],
  );

  const handleCropComplete = useCallback(
    async (blob: Blob) => {
      setProcessing(true);
      try {
        const { blob: cblob, width, height } = await compressImage(blob);
        const objectUrl = URL.createObjectURL(cblob);
        setDraft({ blob: cblob, objectUrl, mediaType: 'image', width, height, layers: [], privacy: 'public' });
        setStep('edit');
      } catch {
        showToast('Could not process that image.', 'error');
        setStep('pick');
      } finally {
        if (imageSrc) URL.revokeObjectURL(imageSrc);
        setImageSrc(null);
        setProcessing(false);
      }
    },
    [imageSrc, showToast],
  );

  const discardDraft = useCallback(() => {
    if (draft?.objectUrl) URL.revokeObjectURL(draft.objectUrl);
    setDraft(null);
    setStep('pick');
  }, [draft]);

  const handlePublish = useCallback(async () => {
    if (!draft || !user) return;
    const author = {
      uid: user.uid,
      username: userData?.username || userData?.name || 'you',
      photoURL: userData?.profilePicture ?? null,
    };
    setPublishing(true);
    setProgress(0);
    try {
      const story = await publishStory(draft, author, setProgress);
      showToast('Story shared!', 'success');
      onPublished(story);
    } catch {
      showToast('Failed to share story. Please try again.', 'error');
      setPublishing(false);
    }
  }, [draft, user, userData, showToast, onPublished]);

  const content = (
    <div className="fixed inset-0 z-[210] bg-black">
      {step === 'pick' && (
        <StorySourcePicker
          onPicked={handlePicked}
          onOpenCamera={() => setStep('camera')}
          onClose={onClose}
          cameraAvailable={isMobileCapture()}
        />
      )}

      {step === 'camera' && (
        <StoryCamera
          onCapture={(file) => void handlePicked(file)}
          onClose={() => setStep('pick')}
        />
      )}

      {step === 'crop' && imageSrc && (
        <ImageCropper
          imageSrc={imageSrc}
          aspect={STORY_ASPECT}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            if (imageSrc) URL.revokeObjectURL(imageSrc);
            setImageSrc(null);
            setStep('pick');
          }}
        />
      )}

      {step === 'edit' && draft && (
        <StoryEditor
          draft={draft}
          onBack={discardDraft}
          onNext={(layers: Layer[]) => {
            setDraft((d) => (d ? { ...d, layers } : d));
            setStep('review');
          }}
        />
      )}

      {step === 'review' && draft && (
        <StoryReview
          draft={draft}
          publishing={publishing}
          progress={progress}
          onBack={() => setStep('edit')}
          onChangePrivacy={(p: StoryPrivacy) => setDraft((d) => (d ? { ...d, privacy: p } : d))}
          onPublish={handlePublish}
        />
      )}

      {processing && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <Loader2 size={32} className="animate-spin text-white" />
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
