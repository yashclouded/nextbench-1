/**
 * Owner-only bottom sheet listing who viewed a story (avatar, name, relative time).
 * Resolves viewer profiles via getPublicUsers.
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Eye } from 'lucide-react';
import { getStoryViewers } from '../../lib/stories';
import { getPublicUsers } from '../../lib/discovery';
import { getOptimizedImageUrl } from '../../lib/utils';

interface Row {
  viewerId: string;
  name: string;
  photoURL: string | null;
  at: Date;
}

function timeAgo(d: Date): string {
  const diff = Math.max(Math.floor((Date.now() - d.getTime()) / 1000), 0);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function StoryViewersSheet({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const viewers = await getStoryViewers(storyId);
        const ids = viewers.map((v) => v.viewerId);
        const users = ids.length ? await getPublicUsers(ids) : [];
        const byId = new Map(users.map((u) => [u.id, u]));
        const next: Row[] = viewers.map((v) => ({
          viewerId: v.viewerId,
          name: byId.get(v.viewerId)?.name || 'User',
          photoURL: byId.get(v.viewerId)?.profilePicture ?? null,
          at: v.lastViewedAt,
        }));
        if (alive) {
          setRows(next);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setRows([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [storyId]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" />
      <motion.div
        className="relative rounded-t-2xl bg-neutral-900 max-h-[70%] flex flex-col"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Eye size={18} /> Viewers {rows.length > 0 && <span className="text-white/60">· {rows.length}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center text-white/80">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-2 py-2">
          {loading ? (
            <p className="text-white/50 text-sm text-center py-8">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-8">No views yet.</p>
          ) : (
            rows.map((r) => (
              <div key={r.viewerId} className="flex items-center gap-3 px-2 py-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-white/15 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {r.photoURL ? (
                    <img src={getOptimizedImageUrl(r.photoURL)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    r.name.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="text-white text-sm flex-1 truncate">{r.name}</span>
                <span className="text-white/50 text-xs">{timeAgo(r.at)}</span>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
