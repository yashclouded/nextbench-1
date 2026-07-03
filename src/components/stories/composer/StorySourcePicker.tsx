/**
 * First step of story creation: choose a source. Desktop uses file inputs (library);
 * mobile also offers the in-app camera. Returns a File to the composer for processing.
 */
import { useRef } from 'react';
import { X, ImageIcon, Camera, Video } from 'lucide-react';

interface Props {
  onPicked: (file: File) => void;
  onOpenCamera: () => void;
  onClose: () => void;
  cameraAvailable: boolean;
}

export default function StorySourcePicker({ onPicked, onOpenCamera, onClose, cameraAvailable }: Props) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) onPicked(file);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">Add to story</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
        <SourceButton icon={<ImageIcon size={22} />} label="Photo or video library" onClick={() => libraryRef.current?.click()} />

        {cameraAvailable ? (
          <SourceButton icon={<Camera size={22} />} label="Camera" onClick={onOpenCamera} />
        ) : (
          <SourceButton icon={<Video size={22} />} label="Take photo / record" onClick={() => captureRef.current?.click()} />
        )}
      </div>

      {/* hidden inputs */}
      <input ref={libraryRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
      <input ref={captureRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  );
}

function SourceButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full max-w-sm flex items-center gap-3 px-5 py-4 rounded-2xl bg-white/10 hover:bg-white/15 transition-colors text-left"
    >
      <span className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'var(--color-brand-teal)' }}>
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
