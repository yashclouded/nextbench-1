import React, { createContext, useContext, useState } from 'react';

interface VideoPrefsContextType {
  globalMuted: boolean;
  setGlobalMuted: (muted: boolean) => void;
  globalVolume: number;
  setGlobalVolume: (volume: number) => void;
}

const VideoPrefsContext = createContext<VideoPrefsContextType>({
  globalMuted: true,
  setGlobalMuted: () => {},
  globalVolume: 0.5,
  setGlobalVolume: () => {},
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

  const [globalVolume, setGlobalVolumeState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('nextbench-video-volume');
      if (stored !== null) {
        const v = parseFloat(stored);
        if (isFinite(v) && v >= 0 && v <= 1) return v;
      }
    } catch { /* ignore */ }
    return 0.5;
  });

  const setGlobalMuted = (muted: boolean) => {
    setGlobalMutedState(muted);
    try {
      localStorage.setItem('nextbench-video-muted', String(muted));
    } catch {
      // localStorage blocked (private browsing) — still update in-memory state
    }
  };

  const setGlobalVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setGlobalVolumeState(clamped);
    try {
      localStorage.setItem('nextbench-video-volume', String(clamped));
    } catch {
      // localStorage blocked — still update in-memory state
    }
  };

  return (
    <VideoPrefsContext.Provider value={{ globalMuted, setGlobalMuted, globalVolume, setGlobalVolume }}>
      {children}
    </VideoPrefsContext.Provider>
  );
};
