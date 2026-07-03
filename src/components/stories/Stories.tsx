/**
 * Stories container: owns the shared tray state, viewer open state, and the creation
 * composer. This is the single component the feed mounts.
 */
import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useAuth } from '../../lib/AuthContext';
import { useStoriesTray } from '../../lib/useStories';
import StoriesRow from './StoriesRow';
import StoryViewer from './StoryViewer';
import StoryComposer from './composer/StoryComposer';

export default function Stories() {
  const { user, userData } = useAuth();
  const { tray, loading, markSeenLocal, refetch } = useStoriesTray();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <>
      <StoriesRow
        tray={tray}
        loading={loading}
        currentUid={user?.uid ?? null}
        currentUserName={userData?.username || userData?.name || 'You'}
        currentUserPhoto={userData?.profilePicture ?? null}
        onOpenAuthor={setOpenIndex}
        onAdd={() => setComposerOpen(true)}
      />

      <AnimatePresence>
        {openIndex !== null && user && (
          <StoryViewer
            key="story-viewer"
            tray={tray}
            initialAuthorIndex={openIndex}
            currentUid={user.uid}
            onClose={() => setOpenIndex(null)}
            onSeen={markSeenLocal}
            onDeleted={refetch}
          />
        )}
      </AnimatePresence>

      {composerOpen && user && (
        <StoryComposer
          onClose={() => setComposerOpen(false)}
          onPublished={() => {
            setComposerOpen(false);
            refetch();
          }}
        />
      )}
    </>
  );
}
