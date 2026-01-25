import { useEffect } from 'react';
import { PlayCircle } from 'lucide-react';
import { useYouTubePlayer } from '@/hooks/useYouTubePlayer';
import { useVideoStore } from '@/stores/videoStore';

export function VideoPlayer() {
  const { videoInfo, seekToTime, clearSeek } = useVideoStore();

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

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-xl ring-1 ring-black/5">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
