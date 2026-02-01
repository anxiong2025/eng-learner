import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen,
  Volume2,
  Trash2,
  Check,
  X,
  ArrowLeft,
  Headphones,
  Eye,
  PenLine,
  Sparkles,
  Brain
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getVocabularyList, reviewVocabulary, deleteVocabulary, type SavedVocabulary } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { AuthDialog } from '@/components/AuthDialog';
import { AIReview } from '@/components/AIReview';
import { MemoryCard } from '@/components/MemoryCard';

const levelColors: Record<string, string> = {
  'IELTS': 'bg-purple-100 text-purple-700',
  'TOEFL': 'bg-blue-100 text-blue-700',
  'CET4': 'bg-green-100 text-green-700',
  'CET6': 'bg-amber-100 text-amber-700',
  'Daily': 'bg-gray-100 text-gray-700',
};

// Learning phase names
const learningStepNames = ['New', '20min', '1h', '9h', 'Learned'];

// Get dot color based on memory strength (0-1)
function getMemoryDotColor(strength: number): string {
  if (strength >= 0.7) return 'bg-green-500';
  if (strength >= 0.4) return 'bg-yellow-500';
  if (strength >= 0.2) return 'bg-orange-500';
  return 'bg-red-500';
}

function speakWord(word: string) {
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
  const audio = new Audio(audioUrl);
  audio.play().catch(err => console.error('Failed to play audio:', err));
}

// Format due time relative to now
function formatDueTime(dueAt?: string, dueDate?: string): string {
  const dueString = dueAt || dueDate;
  if (!dueString) return 'Now';

  const due = new Date(dueAt ? dueAt + 'Z' : dueDate!);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();

  if (diffMs <= 0) return 'Now';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 60) return `${diffMins}min`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

// Check if word is due for review
function isDueForReview(item: SavedVocabulary): boolean {
  const dueString = item.due_at || item.due_date;
  if (!dueString) return true;
  const due = new Date(item.due_at ? item.due_at + 'Z' : item.due_date!);
  return due <= new Date();
}

// No props needed - navigation handled by MainLayout

type ViewMode = 'list' | 'review' | 'ai-review';
type FilterMode = 'all' | 'due';
type ReviewMode = 'listening' | 'spelling' | 'quick';

export function VocabularyBook() {
  const { isAuthenticated } = useAuthStore();
  const [vocabulary, setVocabulary] = useState<SavedVocabulary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewList, setReviewList] = useState<SavedVocabulary[]>([]);
  const [reviewMode, setReviewMode] = useState<ReviewMode>('listening');
  const [userInput, setUserInput] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [hasPlayedAudio, setHasPlayedAudio] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [selectedVocabForCard, setSelectedVocabForCard] = useState<SavedVocabulary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchVocabulary = async () => {
    setIsLoading(true);
    try {
      const result = await getVocabularyList(filterMode === 'due');
      setVocabulary(result.vocabulary);
    } catch (error) {
      console.error('Failed to fetch vocabulary:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVocabulary();
  }, [filterMode]);

  const handleDelete = async (id: number) => {
    try {
      await deleteVocabulary(id);
      setVocabulary(prev => prev.filter(v => v.id !== id));
    } catch (error) {
      console.error('Failed to delete vocabulary:', error);
    }
  };

  const playAudio = useCallback((word: string) => {
    speakWord(word);
    setHasPlayedAudio(true);
  }, []);

  const startAIReview = () => {
    // Check if user is authenticated
    if (!isAuthenticated) {
      setShowAuthDialog(true);
      return;
    }

    const dueWords = vocabulary.filter(isDueForReview);
    if (dueWords.length === 0) {
      alert('No words to review!');
      return;
    }
    setReviewList(dueWords);
    setViewMode('ai-review');
  };

  const handleAIReviewComplete = () => {
    setViewMode('list');
    fetchVocabulary();
  };

  const checkAnswer = useCallback(() => {
    const currentWord = reviewList[currentReviewIndex];
    const normalizedInput = userInput.trim().toLowerCase();
    const correct = normalizedInput === currentWord.word.toLowerCase();
    setIsCorrect(correct);
    setShowAnswer(true);
  }, [currentReviewIndex, reviewList, userInput]);

  const revealAnswer = useCallback(() => {
    if (userInput.trim()) {
      checkAnswer();
    } else {
      setShowAnswer(true);
      setIsCorrect(null);
    }
  }, [checkAnswer, userInput]);

  const handleReview = async (quality: number) => {
    const currentWord = reviewList[currentReviewIndex];
    try {
      await reviewVocabulary(currentWord.id, quality);
    } catch (error) {
      console.error('Failed to review vocabulary:', error);
    }

    if (currentReviewIndex < reviewList.length - 1) {
      const nextIndex = currentReviewIndex + 1;
      setCurrentReviewIndex(nextIndex);
      setShowAnswer(false);
      setUserInput('');
      setIsCorrect(null);
      setHasPlayedAudio(false);

      if (reviewMode === 'listening') {
        setTimeout(() => playAudio(reviewList[nextIndex].word), 300);
      } else {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } else {
      setViewMode('list');
      fetchVocabulary();
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !showAnswer) {
      e.preventDefault();
      revealAnswer();
    } else if (showAnswer) {
      if (e.key === '1') handleReview(0);
      else if (e.key === '2') handleReview(1);
      else if (e.key === '3') handleReview(2);
      else if (e.key === '4') handleReview(3);
    }
  }, [showAnswer, revealAnswer]);

  const dueCount = vocabulary.filter(isDueForReview).length;
  const learningCount = vocabulary.filter(v => (v.learning_step || 0) < 4).length;

  // AI Review Mode UI
  if (viewMode === 'ai-review' && reviewList.length > 0) {
    return (
      <>
        <AIReview
          vocabulary={reviewList}
          onBack={() => setViewMode('list')}
          onComplete={handleAIReviewComplete}
        />
        <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} showTrigger={false} />
      </>
    );
  }

  // Review Mode UI
  if (viewMode === 'review' && reviewList.length > 0) {
    const currentWord = reviewList[currentReviewIndex];
    return (
      <div className="max-w-2xl mx-auto space-y-6" onKeyDown={handleKeyDown} tabIndex={0}>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setViewMode('list')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant={reviewMode === 'listening' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setReviewMode('listening')}
            >
              <Headphones className="w-4 h-4" />
            </Button>
            <Button
              variant={reviewMode === 'spelling' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setReviewMode('spelling')}
            >
              <PenLine className="w-4 h-4" />
            </Button>
            <Button
              variant={reviewMode === 'quick' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setReviewMode('quick')}
            >
              <Eye className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground ml-2">
              {currentReviewIndex + 1}/{reviewList.length}
            </span>
          </div>
        </div>

        <Card>
          <CardContent className="py-8 text-center space-y-6">
            {reviewMode === 'listening' && (
              <div className="space-y-4">
                <button
                  onClick={() => playAudio(currentWord.word)}
                  className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 hover:bg-primary/20"
                >
                  <Volume2 className="w-8 h-8 text-primary" />
                </button>
                <p className="text-xs text-muted-foreground">
                  {hasPlayedAudio ? 'Play again' : 'Click to play'}
                </p>
                {!showAnswer && <div className="text-3xl font-bold text-muted-foreground/30">???</div>}
              </div>
            )}

            {reviewMode === 'spelling' && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Spell the word:</p>
                <p className="text-xl font-medium">{currentWord.meaning}</p>
              </div>
            )}

            {reviewMode === 'quick' && (
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">{currentWord.word}</h2>
                <button
                  onClick={() => speakWord(currentWord.word)}
                  className="text-muted-foreground hover:text-primary"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>
            )}

            {!showAnswer && (
              <div className="space-y-4">
                <Input
                  ref={inputRef}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && revealAnswer()}
                  placeholder="Type your answer (optional)..."
                  className="max-w-xs mx-auto text-center"
                  autoFocus={reviewMode !== 'listening'}
                />
                <Button onClick={revealAnswer}>Show Answer</Button>
              </div>
            )}

            {showAnswer && (
              <div className="space-y-4">
                {isCorrect !== null && userInput.trim() && (
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isCorrect ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    {isCorrect ? 'Correct!' : `Your answer: ${userInput}`}
                  </div>
                )}

                {(reviewMode === 'listening' || reviewMode === 'spelling') && (
                  <div className="space-y-2">
                    <h2 className="text-3xl font-bold">{currentWord.word}</h2>
                    <button onClick={() => speakWord(currentWord.word)} className="text-muted-foreground hover:text-primary">
                      <Volume2 className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <p className="text-lg">{currentWord.meaning}</p>
                {currentWord.example && (
                  <p className="text-sm text-muted-foreground italic">"{currentWord.example}"</p>
                )}

                <div className="flex justify-center gap-2 pt-4">
                  <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleReview(0)}>
                    Forgot
                  </Button>
                  <Button variant="outline" size="sm" className="text-amber-600" onClick={() => handleReview(1)}>
                    Hard
                  </Button>
                  <Button variant="outline" size="sm" className="text-blue-600" onClick={() => handleReview(2)}>
                    Good
                  </Button>
                  <Button variant="outline" size="sm" className="text-green-600" onClick={() => handleReview(3)}>
                    Easy
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // List Mode UI
  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-semibold">Vocabulary</h1>
        <Button
          variant="outline"
          onClick={startAIReview}
          disabled={dueCount === 0}
          className="h-9 text-sm font-normal"
        >
          <Sparkles className="w-4 h-4 mr-1.5 text-primary" />
          Review ({dueCount})
        </Button>
      </div>

      {/* Auth Dialog */}
      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} showTrigger={false} />

      {/* Stats - Grid on mobile, inline on desktop */}
      <div className="grid grid-cols-4 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-6 py-2">
        <div className="text-center">
          <p className="text-xl sm:text-2xl font-bold">{vocabulary.length}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
        </div>
        <div className="text-center sm:border-l sm:pl-6">
          <p className="text-xl sm:text-2xl font-bold text-amber-600">{dueCount}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Due</p>
        </div>
        <div className="text-center sm:border-l sm:pl-6">
          <p className="text-xl sm:text-2xl font-bold text-blue-600">{learningCount}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Learning</p>
        </div>
        <div className="text-center sm:border-l sm:pl-6">
          <p className="text-xl sm:text-2xl font-bold text-green-600">{vocabulary.length - learningCount}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Mastered</p>
        </div>
      </div>

      {/* Filter */}
      <Tabs value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
        <TabsList className="grid w-full max-w-[200px] grid-cols-2 h-10">
          <TabsTrigger value="all" className="h-9">All</TabsTrigger>
          <TabsTrigger value="due" className="h-9">Due</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : vocabulary.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">
            {filterMode === 'due' ? 'No words due for review' : 'No saved words yet'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Click the star icon while watching videos to save words
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {vocabulary.map((item) => {
            const isDue = isDueForReview(item);
            const step = item.learning_step || 0;
            const isLearning = step < 4;
            const dueTime = formatDueTime(item.due_at, item.due_date);
            const strength = item.memory_strength ?? 1;
            const dotColor = getMemoryDotColor(strength);
            return (
              <div
                key={item.id}
                className={`p-3 sm:p-4 rounded-lg border ${isDue ? 'bg-amber-50/50 border-amber-200' : 'bg-card'}`}
              >
                {/* Mobile: Stacked layout, Desktop: Row layout */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  {/* Top row / Left side */}
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    {/* Memory strength dot */}
                    <div className={`w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${dotColor}`} title={`Memory: ${Math.round(strength * 100)}%`} />
                    <button
                      onClick={() => speakWord(item.word)}
                      className="text-muted-foreground hover:text-primary shrink-0 p-1 -m-1 touch-manipulation"
                    >
                      <Volume2 className="w-5 h-5 sm:w-4 sm:h-4" />
                    </button>
                    <span className="font-medium text-base sm:text-sm">{item.word}</span>
                    <Badge variant="secondary" className={`${levelColors[item.level] || levelColors['Daily']} text-xs`}>
                      {item.level}
                    </Badge>
                    {/* Show meaning inline on desktop only */}
                    <span className="hidden sm:inline text-muted-foreground text-sm truncate">{item.meaning}</span>
                  </div>

                  {/* Bottom row on mobile: meaning + badges */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-2 sm:shrink-0">
                    {/* Meaning on mobile */}
                    <span className="sm:hidden text-muted-foreground text-sm truncate flex-1">{item.meaning}</span>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {/* Learning phase indicator */}
                      {isLearning && (
                        <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px] sm:text-xs px-1.5 sm:px-2">
                          {learningStepNames[step]}
                        </Badge>
                      )}
                      {/* Due time indicator */}
                      {isDue ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] sm:text-xs px-1.5 sm:px-2">Now</Badge>
                      ) : (
                        <span className="text-[10px] sm:text-xs text-muted-foreground">{dueTime}</span>
                      )}
                      {/* AI Memory Card button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-violet-600 h-8 w-8 sm:h-auto sm:w-auto p-0 sm:p-2"
                        onClick={() => {
                          if (!isAuthenticated) {
                            setShowAuthDialog(true);
                            return;
                          }
                          setSelectedVocabForCard(item);
                        }}
                        title="AI Memory Card"
                      >
                        <Brain className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive h-8 w-8 sm:h-auto sm:w-auto p-0 sm:p-2"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Memory Card Modal */}
      {selectedVocabForCard && (
        <MemoryCard
          vocabulary={selectedVocabForCard}
          onClose={() => setSelectedVocabForCard(null)}
        />
      )}
    </div>
  );
}
