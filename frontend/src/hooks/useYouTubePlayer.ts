import { useEffect, useRef, useCallback, useState } from 'react';
import { useVideoStore } from '../stores/videoStore';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface UseYouTubePlayerOptions {
  videoId: string;
  onReady?: () => void;
}

export function useYouTubePlayer({ videoId, onReady }: UseYouTubePlayerOptions) {
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const { setCurrentTime, setPlayerState } = useVideoStore();

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
  }, []);

  // Initialize player when video ID changes
  useEffect(() => {
    if (!videoId || !containerRef.current) return;

    const initPlayer = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }

      playerRef.current = new window.YT.Player(containerRef.current!, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          cc_load_policy: 0, // Disable YouTube's own captions
          iv_load_policy: 3, // Disable annotations
        },
        events: {
          onReady: () => {
            setIsReady(true);
            onReady?.();
          },
          onStateChange: (event) => {
            switch (event.data) {
              case YT.PlayerState.PLAYING:
                setPlayerState('playing');
                startTimeTracking();
                break;
              case YT.PlayerState.PAUSED:
                setPlayerState('paused');
                stopTimeTracking();
                break;
              case YT.PlayerState.ENDED:
                setPlayerState('ended');
                stopTimeTracking();
                break;
              case YT.PlayerState.BUFFERING:
                setPlayerState('buffering');
                break;
              default:
                setPlayerState('unstarted');
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      stopTimeTracking();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  const startTimeTracking = useCallback(() => {
    if (intervalRef.current) return;

    intervalRef.current = window.setInterval(() => {
      if (playerRef.current) {
        const time = playerRef.current.getCurrentTime();
        setCurrentTime(time);
      }
    }, 100); // Update every 100ms for smooth sync
  }, [setCurrentTime]);

  const stopTimeTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, true);
    }
  }, []);

  const play = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.playVideo();
    }
  }, []);

  const pause = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.pauseVideo();
    }
  }, []);

  return {
    containerRef,
    isReady,
    seekTo,
    play,
    pause,
  };
}
