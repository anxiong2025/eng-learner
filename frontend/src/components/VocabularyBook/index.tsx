import { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Volume2,
  Trash2,
  RotateCcw,
  Check,
  X,
  Calendar,
  Target,
  Clock,
  ArrowLeft,
  Filter,
  Keyboard,
  Eye
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getVocabularyList, reviewVocabulary, deleteVocabulary, type SavedVocabulary } from '@/api/client';

const levelColors: Record<string, string> = {
  '雅思': 'bg-purple-100 text-purple-700 border-purple-200',
  '托福': 'bg-blue-100 text-blue-700 border-blue-200',
  '四级': 'bg-green-100 text-green-700 border-green-200',
  '六级': 'bg-amber-100 text-amber-700 border-amber-200',
  '日常': 'bg-gray-100 text-gray-700 border-gray-200',
};

function speakWord(word: string) {
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
  const audio = new Audio(audioUrl);
  audio.play().catch(err => console.error('Failed to play audio:', err));
}

interface VocabularyBookProps {
  onBack: () => void;
}

type ViewMode = 'list' | 'review';
type FilterMode = 'all' | 'due';
type ReviewMode = 'typing' | 'quick';

export function VocabularyBook({ onBack }: VocabularyBookProps) {
  const [vocabulary, setVocabulary] = useState<SavedVocabulary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [reviewList, setReviewList] = useState<SavedVocabulary[]>([]);
  const [reviewMode, setReviewMode] = useState<ReviewMode>('typing');
  const [userInput, setUserInput] = useState('');
  const [inputSubmitted, setInputSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
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

  const startReview = () => {
    const dueWords = vocabulary.filter(v => {
      if (!v.due_date) return true;
      return new Date(v.due_date) <= new Date();
    });
    if (dueWords.length === 0) {
      alert('没有待复习的单词！');
      return;
    }
    setReviewList(dueWords);
    setCurrentReviewIndex(0);
    setShowMeaning(false);
    setUserInput('');
    setInputSubmitted(false);
    setIsCorrect(false);
    setViewMode('review');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Check if user input matches the meaning (fuzzy match)
  const checkAnswer = () => {
    const currentWord = reviewList[currentReviewIndex];
    const normalizedInput = userInput.trim().toLowerCase();
    const normalizedMeaning = currentWord.meaning.toLowerCase();

    // Extract key parts from meaning (remove parentheses content like "(n.)", "(v.)" etc)
    const meaningWithoutPos = normalizedMeaning.replace(/\([^)]*\)/g, '').trim();

    // Check if input contains main keywords from meaning
    const correct = meaningWithoutPos.includes(normalizedInput) ||
                   normalizedInput.includes(meaningWithoutPos) ||
                   normalizedMeaning.includes(normalizedInput);

    setIsCorrect(correct);
    setInputSubmitted(true);
    setShowMeaning(true);
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userInput.trim()) {
      checkAnswer();
    }
  };

  const handleReview = async (quality: number) => {
    const currentWord = reviewList[currentReviewIndex];
    try {
      await reviewVocabulary(currentWord.id, quality);
    } catch (error) {
      console.error('Failed to review vocabulary:', error);
    }

    if (currentReviewIndex < reviewList.length - 1) {
      setCurrentReviewIndex(prev => prev + 1);
      setShowMeaning(false);
      setUserInput('');
      setInputSubmitted(false);
      setIsCorrect(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setViewMode('list');
      fetchVocabulary();
    }
  };

  const dueCount = vocabulary.filter(v => {
    if (!v.due_date) return true;
    return new Date(v.due_date) <= new Date();
  }).length;

  if (viewMode === 'review' && reviewList.length > 0) {
    const currentWord = reviewList[currentReviewIndex];
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setViewMode('list')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回列表
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant={reviewMode === 'typing' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReviewMode('typing')}
              title="打字模式"
            >
              <Keyboard className="w-4 h-4" />
            </Button>
            <Button
              variant={reviewMode === 'quick' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReviewMode('quick')}
              title="快速模式"
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Badge variant="outline" className="ml-2">
              {currentReviewIndex + 1} / {reviewList.length}
            </Badge>
          </div>
        </div>

        <Card className="border-2">
          <CardContent className="pt-8 pb-8 text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-4xl font-bold">{currentWord.word}</h2>
              <button
                onClick={() => speakWord(currentWord.word)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
              >
                <Volume2 className="w-5 h-5" />
                <span className="text-sm">朗读</span>
              </button>
            </div>

            {/* Typing Mode Input */}
            {reviewMode === 'typing' && !showMeaning && (
              <form onSubmit={handleInputSubmit} className="space-y-4">
                <div className="max-w-sm mx-auto">
                  <Input
                    ref={inputRef}
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="输入中文释义..."
                    className="text-center text-lg h-12"
                    autoFocus
                  />
                </div>
                <div className="flex justify-center gap-3">
                  <Button type="submit" disabled={!userInput.trim()}>
                    <Check className="w-4 h-4 mr-1" />
                    确认
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowMeaning(true);
                      setInputSubmitted(true);
                      setIsCorrect(false);
                    }}
                  >
                    不知道
                  </Button>
                </div>
              </form>
            )}

            {/* Quick Mode Button */}
            {reviewMode === 'quick' && !showMeaning && (
              <Button size="lg" onClick={() => setShowMeaning(true)}>
                显示释义
              </Button>
            )}

            {/* Show meaning and rating buttons */}
            {showMeaning && (
              <div className="space-y-4">
                {/* Typing result feedback */}
                {reviewMode === 'typing' && inputSubmitted && (
                  <div className={`p-3 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center justify-center gap-2">
                      {isCorrect ? (
                        <>
                          <Check className="w-5 h-5 text-green-600" />
                          <span className="text-green-700 font-medium">正确！</span>
                        </>
                      ) : (
                        <>
                          <X className="w-5 h-5 text-red-600" />
                          <span className="text-red-700 font-medium">
                            你的答案：{userInput || '(未输入)'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-lg">{currentWord.meaning}</p>
                  {currentWord.example && (
                    <p className="mt-3 text-sm text-muted-foreground italic">
                      "{currentWord.example}"
                    </p>
                  )}
                </div>

                <div className="pt-4">
                  <p className="text-sm text-muted-foreground mb-3">这个单词对你来说...</p>
                  <div className="flex justify-center gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 max-w-[100px] border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => handleReview(0)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      忘记
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 max-w-[100px] border-amber-200 text-amber-600 hover:bg-amber-50"
                      onClick={() => handleReview(1)}
                    >
                      困难
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 max-w-[100px] border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => handleReview(2)}
                    >
                      良好
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 max-w-[100px] border-green-200 text-green-600 hover:bg-green-50"
                      onClick={() => handleReview(3)}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      简单
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {currentWord.source_sentence && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">来源句子：</p>
              <p className="mt-1">{currentWord.source_sentence}</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              我的单词本
            </h1>
            <p className="text-sm text-muted-foreground">
              共 {vocabulary.length} 个单词，{dueCount} 个待复习
            </p>
          </div>
        </div>
        <Button onClick={startReview} disabled={dueCount === 0}>
          <RotateCcw className="w-4 h-4 mr-1" />
          开始复习 ({dueCount})
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{vocabulary.length}</p>
              <p className="text-sm text-muted-foreground">总单词数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{dueCount}</p>
              <p className="text-sm text-muted-foreground">待复习</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{vocabulary.length - dueCount}</p>
              <p className="text-sm text-muted-foreground">已掌握</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Button
          variant={filterMode === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterMode('all')}
        >
          全部
        </Button>
        <Button
          variant={filterMode === 'due' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterMode('due')}
        >
          待复习
        </Button>
      </div>

      {/* Vocabulary List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          加载中...
        </div>
      ) : vocabulary.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              {filterMode === 'due' ? '没有待复习的单词' : '还没有收藏任何单词'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              在观看视频时点击星星图标收藏单词
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {vocabulary.map((item) => {
            const isDue = !item.due_date || new Date(item.due_date) <= new Date();
            return (
              <Card key={item.id} className={isDue ? 'border-amber-200 bg-amber-50/30' : ''}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{item.word}</span>
                      <button
                        onClick={() => speakWord(item.word)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${levelColors[item.level] || levelColors['日常']}`}
                    >
                      {item.level}
                    </Badge>
                    <span className="text-muted-foreground truncate">{item.meaning}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDue && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                        待复习
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      复习 {item.review_count} 次
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
