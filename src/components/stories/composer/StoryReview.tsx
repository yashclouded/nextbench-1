/**
 * Final review + publish step. Renders the composed draft through the same StoryContent
 * used by the viewer (WYSIWYG), lets the user pick privacy, and publishes with progress.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, Globe, Users, Loader2 } from 'lucide-react';
import type { Story, StoryPrivacy } from '../../../lib/stories';
import type { StoryDraft } from '../../../lib/storyMedia';
import StoryContent from '../StoryContent';

interface Props {
  draft: StoryDraft;
  publishing: boolean;
  progress: number;
  onBack: () => void;
  onChangePrivacy: (p: StoryPrivacy) => void;
  onPublish: () => void;
}

const PRIVACY: { value: StoryPrivacy; label: string; icon: React.ReactNode }[] = [
  { value: 'public', label: 'Public', icon: <Globe size={15} /> },
  { value: 'followers', label: 'Followers', icon: <Users size={15} /> },
];

export default function StoryReview({ draft, publishing, progress, onBack, onChangePrivacy, onPublish }: Props) {
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Reuse StoryContent for a pixel-accurate preview.
  const previewStory: Story = useMemo(
    () => ({
      id: 'preview',
      authorId: '',
      authorUsername: '',
      authorPhotoURL: null,
      mediaType: draft.mediaType,
      mediaUrl: draft.objectUrl,
      mediaPath: '',
      posterUrl: null,
      posterPath: null,
      width: draft.width,
      height: draft.height,
      durationMs: draft.durationMs,
      layers: draft.layers,
      privacy: draft.privacy,
      status: 'active',
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 3600 * 1000,
    }),
    [draft],
  );

  const currentPrivacy = PRIVACY.find((p) => p.value === draft.privacy) ?? PRIVACY[0];

  return (
    <div className="absolute inset-0 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 z-10">
        <button type="button" onClick={onBack} disabled={publishing} aria-label="Back" className="w-9 h-9 flex items-center justify-center text-white disabled:opacity-40">
          <ChevronLeft size={26} />
        </button>
        <span className="text-white font-semibold">Preview</span>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden px-3">
        <div className="relative w-full h-full max-w-[440px] sm:max-h-[80vh] rounded-2xl overflow-hidden">
          <StoryContent story={previewStory} paused={false} muted onProgress={() => {}} onEnded={() => {}} />
        </div>
      </div>

      <div className="p-4 flex items-center gap-3">
        {/* privacy */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPrivacy((s) => !s)}
            disabled={publishing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium disabled:opacity-40"
          >
            {currentPrivacy.icon}
            {currentPrivacy.label}
          </button>
          {showPrivacy && (
            <div className="absolute bottom-12 left-0 rounded-xl overflow-hidden bg-neutral-800 shadow-xl min-w-[160px]">
              {PRIVACY.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    onChangePrivacy(p.value);
                    setShowPrivacy(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/10 text-left"
                >
                  {p.icon}
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="ml-auto flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-white disabled:opacity-70"
          style={{ background: 'var(--color-brand-teal)' }}
        >
          {publishing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {Math.round(progress * 100)}%
            </>
          ) : (
            'Share to story'
          )}
        </button>
      </div>
    </div>
  );
}
