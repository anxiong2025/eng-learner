import { useEffect, useState } from 'react';
import { PlayCircle, Subtitles } from 'lucide-react';
import { useYouTubePlayer } from '@/hooks/useYouTubePlayer';
import { useVideoStore } from '@/stores/videoStore';

const HINT_STORAGE_KEY = 'englearner_subtitle_hint_shown';

export function VideoPlayer() {
  const { videoInfo, seekToTime, clearSeek, showSubtitle, toggleSubtitle } = useVideoStore();
  const [showHint, setShowHint] = useState(false);

  // Show hint for first-time users
  useEffect(() => {
    if (!videoInfo) return;

    const hasSeenHint = localStorage.getItem(HINT_STORAGE_KEY);
    if (!hasSeenHint) {
      // Delay showing hint so video loads first
      const showTimer = setTimeout(() => {
        setShowHint(true);
      }, 1500);

      // Auto-hide after 4 seconds
      const hideTimer = setTimeout(() => {
        setShowHint(false);
        localStorage.setItem(HINT_STORAGE_KEY, 'true');
      }, 5500);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [videoInfo]);

  const { containerRef, seekTo } = useYouTubePlayer({
    videoId: videoInfo?.video_id || '',
  });

  // Listen for seek requests from store
  useEffect(() => {
    if (seekToTime !== null) {
      seekTo(seekToTime);
      clearSeek();
    }
  }, [seekToTime, seekTo, clearSeek]);

  if (!videoInfo) {
    return (
      <div className="aspect-video bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl flex items-center justify-center">
        <div className="text-center text-slate-400">
          <PlayCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Enter a YouTube URL to start learning</p>
        </div>
      </div>
    );
  }

  const handleToggle = () => {
    toggleSubtitle();
    // Dismiss hint when user interacts
    if (showHint) {
      setShowHint(false);
      localStorage.setItem(HINT_STORAGE_KEY, 'true');
    }
  };

  return (
    <div className="relative aspect-video bg-black rounded-xl overflow-hidden group">
      <div ref={containerRef} className="w-full h-full" />
      {/* Floating subtitle toggle button - larger on mobile for touch */}
      <button
        onClick={handleToggle}
        className={`absolute bottom-2 sm:bottom-3 right-2 sm:right-3 w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all ${
          showHint ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
        } ${
          showSubtitle
            ? 'bg-white/90 text-gray-800 hover:bg-white active:bg-white/80'
            : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white active:bg-black/80'
        }`}
        title={showSubtitle ? 'Hide subtitle' : 'Show subtitle'}
      >
        <Subtitles className="w-5 h-5 sm:w-4 sm:h-4" />
      </button>
      {/* First-time hint */}
      {showHint && (
        <div className="absolute bottom-2 sm:bottom-3 right-14 sm:right-12 animate-in fade-in slide-in-from-right-2 duration-300">
          <div className="bg-black/80 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">
            Toggle subtitle
            <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-black/80 rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
}
