import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Loader2, Link2, ArrowRight, ArrowLeft, GitBranch, FileText, BookOpen, Play, Presentation, PenLine, ChevronLeft, ChevronRight, History, AlertCircle, Crown, Copy, Check, Users } from 'lucide-react';
import { trackPageView } from './lib/firebase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MainLayout } from './components/Layout/MainLayout';
import { VideoPlayer } from './components/VideoPlayer';
import { CurrentSubtitle } from './components/CurrentSubtitle';
import { VocabularyBook } from './components/VocabularyBook';
import { LearningStats } from './components/LearningStats';
import { MindMapPanel } from './components/MindMap/MindMapPanel';
import { SlidePanel } from './components/MindMap/SlidePanel';
import { TranscriptPanel } from './components/TranscriptPanel';
import { VocabularyPanel } from './components/VocabularyPanel';
import { NotesPanel } from './components/NotesPanel';
import { FloatingAI } from './components/FloatingAI';
import { AuthDialog } from './components/AuthDialog';
import { AboutPage } from './components/AboutPage';
import { TermsPage } from './components/TermsPage';
import { PrivacyPage } from './components/PrivacyPage';
import { VideoPageSkeleton } from './components/ui/skeleton';
import { useVideoStore } from './stores/videoStore';
import { useAuthStore } from './store/authStore';
import { useWatchHistoryStore } from './store/watchHistoryStore';
import { DEMO_VIDEO_ID } from './data/demoVideo';
import { getInviteCode } from './api/client';

// Extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  // Handle youtu.be/VIDEO_ID
  if (url.includes('youtu.be/')) {
    const match = url.split('youtu.be/')[1];
    return match?.split(/[?&#]/)[0] || null;
  }
  // Handle youtube.com/watch?v=VIDEO_ID
  if (url.includes('v=')) {
    const match = url.split('v=')[1];
    return match?.split(/[&#]/)[0] || null;
  }
  return null;
}

// Recommended videos data
const recommendedVideos = {
  'Steve Jobs': [
    { id: 'UF8uR6Z6KLc', title: 'Stanford Speech 2005', thumbnail: 'https://i.ytimg.com/vi/UF8uR6Z6KLc/mqdefault.jpg' },
    { id: 'EfAtsfOoh_M', title: 'Stay Hungry Stay Foolish', thumbnail: 'https://i.ytimg.com/vi/EfAtsfOoh_M/mqdefault.jpg' },
    { id: 'Hd_ptbiPoXM', title: 'iPhone Introduction', thumbnail: 'https://i.ytimg.com/vi/Hd_ptbiPoXM/mqdefault.jpg' },
    { id: 'D1R-jKKp3NA', title: 'Think Different', thumbnail: 'https://i.ytimg.com/vi/D1R-jKKp3NA/mqdefault.jpg' },
    { id: 'FF-tKLISfPE', title: 'Lost Interview 1995', thumbnail: 'https://i.ytimg.com/vi/FF-tKLISfPE/mqdefault.jpg' },
    { id: 'Gk-9Fd2mEnI', title: 'MacWorld 1997', thumbnail: 'https://i.ytimg.com/vi/Gk-9Fd2mEnI/mqdefault.jpg' },
  ],
  'AI': [
    { id: 'EWvNQjAaOHw', title: 'How I use LLMs', thumbnail: 'https://i.ytimg.com/vi/EWvNQjAaOHw/mqdefault.jpg' },
    { id: 'VMj-3S1tku0', title: 'Deep Dive into LLMs', thumbnail: 'https://i.ytimg.com/vi/VMj-3S1tku0/mqdefault.jpg' },
    { id: 'l8pRSuU81PU', title: "Let's reproduce GPT-2", thumbnail: 'https://i.ytimg.com/vi/l8pRSuU81PU/mqdefault.jpg' },
    { id: 'zduSFxRajkE', title: 'GPT Tokenizer', thumbnail: 'https://i.ytimg.com/vi/zduSFxRajkE/mqdefault.jpg' },
    { id: 'zjkBMFhNj_g', title: 'Intro to LLMs', thumbnail: 'https://i.ytimg.com/vi/zjkBMFhNj_g/mqdefault.jpg' },
    { id: 'kCc8FmEb1nY', title: "Let's build GPT", thumbnail: 'https://i.ytimg.com/vi/kCc8FmEb1nY/mqdefault.jpg' },
  ],
  'Startup': [
    { id: 'F4K0k7I47cI', title: 'How to Start a Startup', thumbnail: 'https://i.ytimg.com/vi/F4K0k7I47cI/mqdefault.jpg' },
    { id: 'CBYhVcO4WgI', title: 'Y Combinator', thumbnail: 'https://i.ytimg.com/vi/CBYhVcO4WgI/mqdefault.jpg' },
    { id: 'ZoqgAy3h4OM', title: 'Paul Graham', thumbnail: 'https://i.ytimg.com/vi/ZoqgAy3h4OM/mqdefault.jpg' },
    { id: 'ii1jcLg-eIQ', title: 'Naval Ravikant', thumbnail: 'https://i.ytimg.com/vi/ii1jcLg-eIQ/mqdefault.jpg' },
  ],
  'Tech CEO': [
    { id: 'XFnGhrC_3Gs', title: 'Tim Cook', thumbnail: 'https://i.ytimg.com/vi/XFnGhrC_3Gs/mqdefault.jpg' },
    { id: 'YSyWtESoeOc', title: 'Jensen Huang', thumbnail: 'https://i.ytimg.com/vi/YSyWtESoeOc/mqdefault.jpg' },
    { id: 'kCc8FmEb1nY', title: 'Sundar Pichai', thumbnail: 'https://i.ytimg.com/vi/kCc8FmEb1nY/mqdefault.jpg' },
    { id: 'Fg_JcKSHUtQ', title: 'Mark Zuckerberg', thumbnail: 'https://i.ytimg.com/vi/Fg_JcKSHUtQ/mqdefault.jpg' },
    { id: 'UC1kct7r-pc', title: 'Satya Nadella', thumbnail: 'https://i.ytimg.com/vi/UC1kct7r-pc/mqdefault.jpg' },
  ],
  'Buffett': [
    { id: '2MHIcabnjrA', title: 'HBO Documentary', thumbnail: 'https://i.ytimg.com/vi/2MHIcabnjrA/mqdefault.jpg' },
    { id: 'PjBf8G9HvMo', title: '1998 Florida Speech', thumbnail: 'https://i.ytimg.com/vi/PjBf8G9HvMo/mqdefault.jpg' },
    { id: 'jrpVoc7gVXo', title: 'Advice for Young People', thumbnail: 'https://i.ytimg.com/vi/jrpVoc7gVXo/mqdefault.jpg' },
    { id: 'r-gvIeNWAPo', title: 'Interview with Bill Gates', thumbnail: 'https://i.ytimg.com/vi/r-gvIeNWAPo/mqdefault.jpg' },
    { id: '69rm13iUUgE', title: 'Berkshire 2023 Meeting', thumbnail: 'https://i.ytimg.com/vi/69rm13iUUgE/mqdefault.jpg' },
    { id: 'LIBWBR3xAYQ', title: 'Investment Philosophy', thumbnail: 'https://i.ytimg.com/vi/LIBWBR3xAYQ/mqdefault.jpg' },
  ],
};


// Feature Showcase Component - Video Demo
function FeatureShowcase() {
  const DEMO_VIDEO_YOUTUBE_ID = '45WgxMtPf3U';
  const [isPlaying, setIsPlaying] = useState(false);

  const features = [
    { icon: FileText, label: 'Bilingual Subtitles', desc: 'Real-time sync' },
    { icon: GitBranch, label: 'AI Mind Map', desc: 'Auto-generated' },
    { icon: Presentation, label: 'AI Slides', desc: 'One-click PPT' },
    { icon: BookOpen, label: 'Smart Vocab', desc: 'Spaced repetition' },
  ];

  return (
    <div className="w-full pt-12 pb-40 bg-muted/30">
      <div className="max-w-[800px] mx-auto px-6">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold text-foreground mb-2">See it in Action</h2>
          <p className="text-sm text-muted-foreground">Watch how it transforms your learning experience</p>
        </div>

        {/* YouTube Video - Click to play inline */}
        <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg">
          {!isPlaying ? (
            <button
              onClick={() => setIsPlaying(true)}
              className="w-full h-full relative group cursor-pointer"
            >
              <img
                src={`https://img.youtube.com/vi/${DEMO_VIDEO_YOUTUBE_ID}/maxresdefault.jpg`}
                alt="Menmo Demo"
                className="w-full h-full object-cover scale-[1.05]"
              />
              {/* Top gradient fade - hides black bars */}
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-muted/80 to-transparent pointer-events-none" />
              {/* Bottom gradient fade - hides black bars */}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-muted/80 to-transparent pointer-events-none" />
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </button>
          ) : (
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${DEMO_VIDEO_YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1`}
              title="Menmo Demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>

        {/* Features */}
        <div className="grid grid-cols-4 gap-4 mt-8">
          {features.map((feature, index) => (
            <div key={index} className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{feature.label}</span>
              <span className="text-xs text-muted-foreground">{feature.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Home Page Component
function HomePage() {
  const [inputUrl, setInputUrl] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<{ id: string; title: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState('Steve Jobs');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { isLoading, error, loadDemoVideo } = useVideoStore();
  const { history } = useWatchHistoryStore();

  const videos = recommendedVideos[activeCategory as keyof typeof recommendedVideos] || [];

  // Reset index when category changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [activeCategory]);

  // Auto-rotate carousel
  useEffect(() => {
    if (isPaused || videos.length <= 3) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % videos.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused, videos.length]);

  // Mouse wheel scroll
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        setCurrentIndex((prev) => (prev + 1) % videos.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + videos.length) % videos.length);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [videos.length]);

  // Get 3 videos to display (previous, current, next)
  const getVisibleVideos = () => {
    if (videos.length === 0) return [];
    if (videos.length <= 3) return videos.map((v, i) => ({ ...v, position: i === 1 ? 'center' : i === 0 ? 'left' : 'right' }));

    const prev = (currentIndex - 1 + videos.length) % videos.length;
    const next = (currentIndex + 1) % videos.length;

    return [
      { ...videos[prev], position: 'left' as const },
      { ...videos[currentIndex], position: 'center' as const },
      { ...videos[next], position: 'right' as const },
    ];
  };

  const handleTryDemo = () => {
    loadDemoVideo();
    navigate(`/watch/${DEMO_VIDEO_ID}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    const videoId = extractVideoId(inputUrl.trim());
    if (videoId) {
      navigate(`/watch/${videoId}`);
    }
  };

  const handleVideoClick = (video: { id: string; title: string }) => {
    setSelectedVideo(video);
  };

  const handleConfirmWatch = () => {
    if (selectedVideo) {
      navigate(`/watch/${selectedVideo.id}`);
      setSelectedVideo(null);
    }
  };

  return (
    <div className="w-full flex flex-col">
      <div className="min-h-[calc(100vh-48px)] flex flex-col items-center justify-center pb-16">
      <div className="w-full max-w-[900px] mx-auto px-6">
      {/* Hero */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-semibold text-foreground mb-2">
          Menmo Action AI
        </h1>
        <p className="text-sm text-muted-foreground">
          Interest-driven learning in the AI era
        </p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="w-full max-w-[600px] mx-auto mb-3">
        <div className="relative">
          <div className="input-glow-border bg-white dark:bg-zinc-800 rounded-[20px] border border-[#ebebeb] dark:border-zinc-700 px-5 py-3 flex items-center gap-3 shadow-[0_0_30px_8px_rgba(0,0,0,0.03)] hover:shadow-[0_0_36px_10px_rgba(0,0,0,0.06)] transition-shadow">
            <Link2 className="w-5 h-5 text-[#9aa0a6] dark:text-zinc-500 shrink-0" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Paste a YouTube link to start learning"
              className="flex-1 bg-transparent border-0 outline-none text-base placeholder:text-[#9aa0a6] dark:placeholder:text-zinc-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputUrl.trim()}
              className="w-9 h-9 rounded-full bg-[#f0f0f0] dark:bg-zinc-700 flex items-center justify-center text-[#5f6368] dark:text-zinc-300 hover:bg-[#e0e0e0] dark:hover:bg-zinc-600 disabled:opacity-30 transition-colors shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-destructive/10 rounded-xl text-destructive text-sm">
            {error}
          </div>
        )}
      </form>

      {/* Action Buttons */}
      <div className="flex justify-center items-center gap-3 mb-4">
        <button
          onClick={handleTryDemo}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Play className="w-4 h-4" />
          Try Demo
        </button>
        {/* Watch History - show if has history */}
        {history.length > 0 && (
          <>
            <span className="text-muted-foreground/40">|</span>
            <div className="relative group/history">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <History className="w-4 h-4" />
                Watch History
              </button>
              {/* Dropdown */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-[280px] bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-border opacity-0 invisible group-hover/history:opacity-100 group-hover/history:visible transition-all z-50">
                <div className="p-2 max-h-[300px] overflow-y-auto">
                  {history.slice(0, 10).map((item) => (
                    <button
                      key={item.videoId}
                      onClick={() => navigate(`/watch/${item.videoId}`)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-16 h-9 object-cover rounded"
                      />
                      <span className="flex-1 text-sm line-clamp-2">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Recommended Videos */}
      <div className="flex flex-col items-center mt-2">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 mb-4 p-1 rounded-full bg-white/40 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10">
          {Object.keys(recommendedVideos).map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                activeCategory === category
                  ? 'bg-white dark:bg-white/20 text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Videos - 3 Card Arc Carousel */}
        <div
          ref={carouselRef}
          className="group w-full max-w-[680px] flex items-center justify-center gap-3 relative"
          style={{ perspective: '1000px' }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Left Arrow */}
          <button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + videos.length) % videos.length)}
            className="absolute -left-10 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 dark:bg-zinc-800/80 shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-zinc-700 transition-all z-20 opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Right Arrow */}
          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % videos.length)}
            className="absolute -right-10 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 dark:bg-zinc-800/80 shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-zinc-700 transition-all z-20 opacity-0 group-hover:opacity-100"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {getVisibleVideos().map((video) => {
            const isCenter = video.position === 'center';
            const isLeft = video.position === 'left';
            const isRight = video.position === 'right';

            return (
              <button
                key={`${video.id}-${video.position}`}
                onClick={() => handleVideoClick(video)}
                className={`group text-left transition-all duration-700 ease-out ${
                  isCenter ? 'w-[220px] z-10' : 'w-[160px]'
                }`}
                style={{
                  transform: isLeft
                    ? 'rotateY(-20deg) scale(0.95)'
                    : isRight
                    ? 'rotateY(20deg) scale(0.95)'
                    : 'rotateY(0deg) scale(1)',
                  transformOrigin: isLeft ? 'right center' : isRight ? 'left center' : 'center center',
                  transformStyle: 'preserve-3d',
                  opacity: isCenter ? 1 : 0.85,
                }}
              >
                <div className={`relative aspect-video rounded-lg overflow-hidden bg-muted shadow-md group-hover:shadow-xl transition-all duration-300 ${
                  isCenter ? 'ring-2 ring-primary/20' : ''
                }`}>
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                    <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                    </div>
                  </div>
                </div>
                <p className={`mt-2 text-foreground line-clamp-1 group-hover:text-primary transition-all text-center ${
                  isCenter ? 'text-sm font-medium' : 'text-xs'
                }`}>
                  {video.title}
                </p>
              </button>
            );
          })}
        </div>

        {/* Carousel Indicators */}
        <div className="flex gap-1.5 mt-4">
          {videos.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                index === currentIndex ? 'bg-primary w-5' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Learning?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to start learning with: <span className="font-medium text-foreground">{selectedVideo?.title}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmWatch}>Start</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      </div>

      {/* Feature Showcase Section */}
      <FeatureShowcase />
    </div>
  );
}

// Watch Page Component
function WatchPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { loadVideo, loadDemoVideo, videoInfo, isLoading, error, reset, rateLimitExceeded, clearRateLimitError, loginRequired, clearLoginRequired } = useVideoStore();
  const { addToHistory } = useWatchHistoryStore();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'mindmap' | 'slides' | 'transcript' | 'vocabulary' | 'notes'>('transcript');
  const [inviteLink, setInviteLink] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // If videoId changes or doesn't match current video, load the new one
    if (videoId) {
      if (!videoInfo || videoInfo.video_id !== videoId) {
        reset(); // Clear old data first
        // Use pre-loaded data for demo video, otherwise fetch from API
        if (videoId === DEMO_VIDEO_ID) {
          loadDemoVideo();
        } else {
          const url = `https://www.youtube.com/watch?v=${videoId}`;
          // Pass videoId for fast cache lookup (skips parseVideo API call if cached)
          loadVideo(url, videoId);
        }
      }
    }
  }, [videoId]);

  // Save to watch history when video info is loaded
  useEffect(() => {
    if (videoInfo && videoId) {
      addToHistory({
        videoId: videoId,
        title: videoInfo.title,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      });
    }
  }, [videoInfo, videoId, addToHistory]);

  // Fetch invite link when rate limit is exceeded
  useEffect(() => {
    if (rateLimitExceeded && isAuthenticated) {
      getInviteCode().then(data => {
        setInviteLink(data.invite_link);
      }).catch(() => {
        // Silently fail - user might not be logged in
      });
    }
  }, [rateLimitExceeded, isAuthenticated]);

  // Auto-reload video when user logs in after loginRequired
  useEffect(() => {
    if (isAuthenticated && loginRequired && videoId && videoId !== DEMO_VIDEO_ID) {
      clearLoginRequired();
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      loadVideo(url, videoId);
    }
  }, [isAuthenticated, loginRequired, videoId]);

  // Reset and go home
  const handleGoHome = () => {
    reset();
    navigate('/');
  };

  if (isLoading) {
    return <VideoPageSkeleton />;
  }

  // Show login required dialog
  if (loginRequired) {
    return (
      <div className="min-h-screen bg-background">
        <AlertDialog open={true} onOpenChange={() => {}}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <AlertDialogTitle className="text-xl">Sign In Required</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-base">
                Please sign in to watch this video. You can try our demo video without signing in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-3 mt-4">
              <AuthDialog open={true} onOpenChange={() => {}} showTrigger={false} />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    clearLoginRequired();
                    navigate(`/watch/${DEMO_VIDEO_ID}`);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Try Demo
                </button>
                <button
                  onClick={() => {
                    clearLoginRequired();
                    navigate('/');
                  }}
                  className="flex-1 py-2 px-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back to Home
                </button>
              </div>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Handle copy invite link
  const handleCopyInvite = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Show rate limit dialog
  if (rateLimitExceeded) {
    return (
      <div className="min-h-screen bg-background">
        <AlertDialog open={true} onOpenChange={() => {}}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <AlertDialogTitle className="text-xl">Daily Free Limit Reached</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-base">
                Free users can parse 3 videos per day. You can continue learning from your watch history, or invite friends for more.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-3 mt-4">
              {/* Invite friend section */}
              {isAuthenticated && inviteLink && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">Invite friends, +3 each</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteLink}
                      readOnly
                      className="flex-1 px-3 py-2 text-xs bg-white dark:bg-zinc-800 border border-border rounded-md"
                    />
                    <button
                      onClick={handleCopyInvite}
                      className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-1"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}
              {!isAuthenticated && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-blue-700 dark:text-blue-300">Sign in to invite friends for more</span>
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  clearRateLimitError();
                  navigate('/');
                }}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <History className="w-4 h-4" />
                View History
              </button>
              <button
                onClick={() => {
                  clearRateLimitError();
                  navigate('/');
                }}
                className="flex items-center justify-center gap-2 w-full py-2 px-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to Home
              </button>
              {/* Pro upgrade button - reserved for future */}
              <div className="pt-3 border-t border-border/50">
                <button
                  disabled
                  className="flex items-center justify-center gap-2 w-full py-2 px-4 text-xs text-muted-foreground/60 cursor-not-allowed"
                >
                  <Crown className="w-4 h-4" />
                  Upgrade to Pro - Unlimited (Coming Soon)
                </button>
              </div>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <div className="p-4 bg-destructive/10 rounded-xl text-destructive text-sm max-w-md">
            {error}
          </div>
          <button
            onClick={handleGoHome}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Go back home
          </button>
        </div>
      </div>
    );
  }

  if (!videoInfo) {
    return null;
  }

  return (
    <div className="bg-background">
      {/* Header - fixed at top */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          {/* Left: Home button */}
          <button
            onClick={handleGoHome}
            className="flex items-center hover:opacity-80 transition-opacity"
            title="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Right: Sign In */}
          <AuthDialog />
        </div>
      </header>

      {/* Main viewport - exactly screen height, with top padding for fixed header */}
      <div className="h-screen pt-14 flex flex-col overflow-hidden">
        {/* Main Content - fills remaining viewport height */}
        <main className="flex-1 overflow-y-auto lg:overflow-hidden px-4 sm:px-10 lg:px-20 py-4">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 max-w-[1300px] mx-auto justify-center h-full">
            {/* Left: Video Player */}
            <div className="shrink-0 lg:flex-1 lg:max-w-[680px] flex flex-col overflow-hidden">
              <VideoPlayer />
              <CurrentSubtitle />
            </div>

            {/* Right: Tabbed Panel */}
            <div className="w-full lg:w-[450px] h-[50vh] lg:h-auto lg:max-h-[calc(100vh-140px)] shrink-0 bg-background rounded-xl border border-border/30 flex flex-col overflow-hidden">
              {/* Tabs - sticky */}
              <div className="flex items-center border-b border-border/50 px-4 pt-3 pb-0 shrink-0">
                <button
                  onClick={() => setActiveTab('transcript')}
                  className={`flex items-center gap-1 px-2 py-2 text-xs font-medium transition-colors relative ${
                    activeTab === 'transcript'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Script
                  {activeTab === 'transcript' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('vocabulary')}
                  className={`flex items-center gap-1 px-2 py-2 text-xs font-medium transition-colors relative ${
                    activeTab === 'vocabulary'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  Vocab
                  {activeTab === 'vocabulary' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`flex items-center gap-1 px-2 py-2 text-xs font-medium transition-colors relative ${
                    activeTab === 'notes'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <PenLine className="w-4 h-4" />
                  Notes
                  {activeTab === 'notes' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('mindmap')}
                  className={`flex items-center gap-1 px-2 py-2 text-xs font-medium transition-colors relative ${
                    activeTab === 'mindmap'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <GitBranch className="w-4 h-4" />
                  Map
                  {activeTab === 'mindmap' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('slides')}
                  className={`flex items-center gap-1 px-2 py-2 text-xs font-medium transition-colors relative ${
                    activeTab === 'slides'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Presentation className="w-4 h-4" />
                  Slides
                  <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary">Beta</span>
                  {activeTab === 'slides' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                  )}
                </button>
              </div>

              {/* Tab Content - scrollable */}
              <div className="flex-1 overflow-auto p-4">
                {activeTab === 'transcript' && <TranscriptPanel />}
                {activeTab === 'vocabulary' && <VocabularyPanel />}
                {activeTab === 'mindmap' && <MindMapPanel />}
                {activeTab === 'slides' && <SlidePanel />}
                {activeTab === 'notes' && <NotesPanel />}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Footer - only visible when scrolling down */}
      <footer className="py-4 border-t border-border/50">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>© 2026 Menmo</span>
          <a href="/about" className="hover:text-foreground transition-colors">About</a>
          <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
          <a href="mailto:contact@tubemo.com" className="hover:text-foreground transition-colors">Contact</a>
        </div>
      </footer>

      {/* Floating AI Assistant */}
      <FloatingAI />
    </div>
  );
}

// Vocabulary Page Component
function VocabularyPage() {
  const navigate = useNavigate();
  return (
    <MainLayout onNavigate={(view) => navigate(view === 'home' ? '/' : `/${view}`)} currentView="vocabulary">
      <VocabularyBook />
    </MainLayout>
  );
}

// Stats Page Component
function StatsPage() {
  const navigate = useNavigate();
  return (
    <MainLayout onNavigate={(view) => navigate(view === 'home' ? '/' : `/${view}`)} currentView="stats">
      <LearningStats />
    </MainLayout>
  );
}

// Main App Component
function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();

  // Track page views
  useEffect(() => {
    const pageName = location.pathname === '/' ? 'Home' :
      location.pathname.startsWith('/watch/') ? 'Watch' :
      location.pathname === '/vocabulary' ? 'Vocabulary' :
      location.pathname === '/stats' ? 'Stats' :
      location.pathname === '/about' ? 'About' : 'Other';
    trackPageView(pageName);
  }, [location.pathname]);

  // Store ref code from URL for invitation tracking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem('invite-ref-code', refCode);
      // Clean up URL without losing other params
      params.delete('ref');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authSuccess = params.get('auth_success');
    const token = params.get('token');

    if (authSuccess === 'true' && token) {
      login(decodeURIComponent(token));

      // Clear the stored ref code after successful login
      localStorage.removeItem('invite-ref-code');

      // Redirect back to the page user was on before login
      const returnUrl = localStorage.getItem('auth-return-url');
      localStorage.removeItem('auth-return-url');

      if (returnUrl) {
        // Extract path from full URL
        try {
          const url = new URL(returnUrl);
          navigate(url.pathname);
        } catch {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    const authError = params.get('error');
    if (authError) {
      console.error('OAuth error:', authError);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [login, navigate]);

  const handleNavigate = (view: 'home' | 'vocabulary' | 'stats') => {
    navigate(view === 'home' ? '/' : `/${view}`);
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          <MainLayout onNavigate={handleNavigate} currentView="home">
            <HomePage />
          </MainLayout>
        }
      />
      <Route path="/watch/:videoId" element={<WatchPage />} />
      <Route path="/vocabulary" element={<VocabularyPage />} />
      <Route path="/stats" element={<StatsPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
    </Routes>
  );
}

export default App;
