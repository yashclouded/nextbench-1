import React, { createContext, useContext, useState } from 'react';

interface VideoPrefsContextType {
  globalMuted: boolean;
  setGlobalMuted: (muted: boolean) => void;
}

const VideoPrefsContext = createContext<VideoPrefsContextType>({
  globalMuted: true,
  setGlobalMuted: () => {},
});

export const useVideoPrefs = () => useContext(VideoPrefsContext);

export const VideoPrefsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [globalMuted, setGlobalMutedState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('nextbench-video-muted');
      // If user has explicitly unmuted before, start unmuted
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const setGlobalMuted = (muted: boolean) => {
    setGlobalMutedState(muted);
    try {
      localStorage.setItem('nextbench-video-muted', String(muted));
    } catch {
      // localStorage blocked (private browsing) — still update in-memory state
    }
  };

  return (
    <VideoPrefsContext.Provider value={{ globalMuted, setGlobalMuted }}>
      {children}
    </VideoPrefsContext.Provider>
  );
};
