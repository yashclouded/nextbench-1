/**
 * The horizontally scrollable stories row shown at the top of the feed. Presentational:
 * it receives the tray + current-user info and reports taps upward. The "Your story"
 * bubble is always first (opens your stories if you have any; the `+` triggers creation).
 */
import type { TrayEntry } from '../../lib/stories';
import StoryAvatar from './StoryAvatar';

interface Props {
  tray: TrayEntry[];
  loading: boolean;
  currentUid: string | null;
  currentUserName: string;
  currentUserPhoto: string | null;
  onOpenAuthor: (trayIndex: number) => void;
  onAdd: () => void;
}

export default function StoriesRow({
  tray,
  loading,
  currentUid,
  currentUserName,
  currentUserPhoto,
  onOpenAuthor,
  onAdd,
}: Props) {
  // Stories are a signed-in feature.
  if (!currentUid) return null;

  const ownIndex = tray.findIndex((e) => e.authorId === currentUid);
  const ownEntry = ownIndex >= 0 ? tray[ownIndex] : null;
  const others = tray
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.authorId !== currentUid);

  const showSkeleton = loading && tray.length === 0;

  return (
    <div
      className="border-b overflow-x-auto no-scrollbar"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="flex gap-3 px-4 py-3 w-max">
        {/* Your story / add */}
        <StoryAvatar
          username={currentUserName}
          photoURL={currentUserPhoto}
          label="Your story"
          ring={ownEntry ? (ownEntry.hasUnseen ? 'unseen' : 'seen') : 'none'}
          showPlus
          onPlusClick={onAdd}
          onClick={ownEntry ? () => onOpenAuthor(ownIndex) : onAdd}
        />

        {showSkeleton
          ? Array.from({ length: 5 }).map((_, i) => <BubbleSkeleton key={i} />)
          : others.map(({ entry, index }) => (
              <StoryAvatar
                key={entry.authorId}
                username={entry.username}
                photoURL={entry.photoURL}
                ring={entry.hasUnseen ? 'unseen' : 'seen'}
                onClick={() => onOpenAuthor(index)}
              />
            ))}
      </div>
    </div>
  );
}

function BubbleSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0 w-[72px]">
      <div className="w-[72px] h-[72px] rounded-full animate-pulse" style={{ background: 'var(--color-luxury-ink-faint)' }} />
      <div className="h-2.5 w-12 rounded-full animate-pulse" style={{ background: 'var(--color-luxury-ink-faint)' }} />
    </div>
  );
}
