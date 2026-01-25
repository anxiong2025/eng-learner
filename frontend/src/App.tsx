import { useState } from 'react';
import { Play, Plus, Loader2, PlayCircle } from 'lucide-react';
import { MainLayout } from './components/Layout/MainLayout';
import { VideoPlayer } from './components/VideoPlayer';
import { CurrentSubtitle } from './components/CurrentSubtitle';
import { VocabularyCard } from './components/VocabularyCard';
import { VocabularyBook } from './components/VocabularyBook';
import { LearningStats } from './components/LearningStats';
import { AIChat } from './components/AIChat';
import { useVideoStore } from './stores/videoStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ViewType = 'home' | 'vocabulary' | 'stats';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const { loadVideo, videoInfo, isLoading, error, reset, playerState } = useVideoStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    await loadVideo(inputUrl.trim());
  };

  const handleNewVideo = () => {
    reset();
    setInputUrl('');
  };

  // Handle navigation
  const handleNavigate = (view: ViewType) => {
    setCurrentView(view);
  };

  // Render VocabularyBook view
  if (currentView === 'vocabulary') {
    return (
      <MainLayout onNavigate={handleNavigate} currentView={currentView}>
        <VocabularyBook onBack={() => setCurrentView('home')} />
      </MainLayout>
    );
  }

  // Render LearningStats view
  if (currentView === 'stats') {
    return (
      <MainLayout onNavigate={handleNavigate} currentView={currentView}>
        <LearningStats onBack={() => setCurrentView('home')} />
      </MainLayout>
    );
  }

  return (
    <MainLayout hideHeader={!!videoInfo} onNavigate={handleNavigate} currentView={currentView}>
      {/* URL Input Section */}
      {!videoInfo && (
        <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-3 sm:space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/25">
              <PlayCircle className="w-7 h-7 sm:w-8 sm:h-8 text-primary-foreground" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Start Learning English</h2>
            <p className="text-muted-foreground text-base sm:text-lg px-4 sm:px-0">
              Paste a YouTube video URL to begin watching with bilingual subtitles
            </p>
          </div>

          {/* Input Form */}
          <Card className="border-2 border-dashed">
            <CardContent className="pt-4 sm:pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="h-11 sm:h-12 text-base"
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isLoading || !inputUrl.trim()}
                    className="h-11 sm:h-12 px-6 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 w-full sm:w-auto"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Start
                      </>
                    )}
                  </Button>
                </div>

                {error && (
                  <div className="p-3 sm:p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                    {error}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-2xl">🎬</span>
                  Bilingual Subtitles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Watch with English, Chinese, or both subtitles synchronized
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-2xl">✨</span>
                  AI Highlights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Important sentences highlighted automatically by AI
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-2xl">📝</span>
                  Save Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Save useful sentences to your personal notebook
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  Ask AI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Pause and ask AI to explain any sentence
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Video Learning View */}
      {videoInfo && (
        <div className="space-y-3 sm:space-y-4">
          {/* Top Bar - Title + New Video button */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h1 className="font-semibold text-sm sm:text-base truncate">{videoInfo.title}</h1>
              <span className="text-xs text-muted-foreground shrink-0">{formatDuration(videoInfo.duration)}</span>
              <Badge
                variant="outline"
                className={playerState === 'playing'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-muted text-muted-foreground'
                }
              >
                {playerState === 'playing' ? 'Playing' : playerState === 'paused' ? 'Paused' : 'Ready'}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleNewVideo} className="shrink-0">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">New Video</span>
            </Button>
          </div>

          {/* Main Content: Video + Vocabulary + AI Chat */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
            {/* Video Player + Vocabulary - Left Side */}
            <div className="lg:col-span-3 space-y-4">
              <div>
                <VideoPlayer />
                <CurrentSubtitle />
              </div>
              {/* Vocabulary Card */}
              <div className="h-[200px] sm:h-[250px]">
                <VocabularyCard />
              </div>
            </div>

            {/* AI Chat - Right Side */}
            <div className="lg:col-span-2 h-[350px] sm:h-[450px] lg:h-[calc(100vh-180px)]">
              <AIChat />
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}

export default App;
