/**
 * Bottom bar shown on the owner's own story: a "Seen by N" button (opens the viewers
 * sheet) and a delete action with an inline confirm.
 */
import { useEffect, useState } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { getStoryViewCount } from '../../lib/stories';

interface Props {
  storyId: string;
  onOpenViewers: () => void;
  onDelete: () => void;
}

export default function StoryOwnerBar({ storyId, onOpenViewers, onDelete }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    setCount(null);
    setConfirming(false);
    getStoryViewCount(storyId)
      .then((c) => alive && setCount(c))
      .catch(() => alive && setCount(0));
    return () => {
      alive = false;
    };
  }, [storyId]);

  return (
    <div
      className="absolute bottom-0 inset-x-0 p-3 pt-8 bg-gradient-to-t from-black/60 to-transparent pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-white text-sm flex-1">Delete this story?</span>
          <button type="button" onClick={() => setConfirming(false)} className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-medium">
            Cancel
          </button>
          <button type="button" onClick={onDelete} className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-semibold">
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button type="button" onClick={onOpenViewers} className="flex items-center gap-2 text-white font-medium">
            <Eye size={18} />
            <span className="text-sm">{count === null ? 'Seen by…' : `Seen by ${count}`}</span>
          </button>
          <button type="button" onClick={() => setConfirming(true)} aria-label="Delete story" className="ml-auto w-9 h-9 flex items-center justify-center text-white/90">
            <Trash2 size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
