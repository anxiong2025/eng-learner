import { useEffect, useState } from 'react';
import {
  BookOpen,
  Loader2,
  Check,
  Plus,
  CheckCircle2,
  AlertCircle,
  Volume2
} from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AuthDialog } from '@/components/AuthDialog';

// Speak word using Youdao Dictionary audio
function speakWord(word: string) {
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
  const audio = new Audio(audioUrl);
  audio.play().catch(err => {
    console.error('Failed to play audio:', err);
  });
}

// Level badge colors
const levelColors: Record<string, string> = {
  'CET-4': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'CET-6': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'IELTS': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'TOEFL': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'GRE': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Phrase': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Advanced': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'Basic': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

export function VocabularyPanel() {
  const {
    videoInfo,
    subtitlesEn,
    vocabulary,
    isExtractingVocab,
    vocabProgress,
    vocabError,
    extractVocabulary,
    saveWord,
    saveAllWords,
  } = useVideoStore();

  const { isAuthenticated } = useAuthStore();
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // Gate save actions - require login
  const handleSaveWord = (index: number) => {
    if (!isAuthenticated) {
      setShowAuthDialog(true);
      return;
    }
    saveWord(index);
  };

  const handleSaveAllWords = () => {
    if (!isAuthenticated) {
      setShowAuthDialog(true);
      return;
    }
    saveAllWords();
  };

  // Auto-extract vocabulary when component mounts (if not already extracted)
  useEffect(() => {
    if (videoInfo && subtitlesEn.length > 0 && vocabulary.length === 0 && !isExtractingVocab) {
      extractVocabulary();
    }
  }, [videoInfo, subtitlesEn.length, vocabulary.length, isExtractingVocab, extractVocabulary]);

  // Count stats
  const savedCount = vocabulary.filter(w => w.saved).length;
  const totalCount = vocabulary.length;
  const isAddingAll = vocabulary.some(w => w.saving) && vocabulary.filter(w => w.saving).length > 1;
  const isLoading = isExtractingVocab && vocabulary.length === 0;

  if (!videoInfo) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Load a video to extract vocabulary</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with actions */}
      {vocabulary.length > 0 && (
        <div className="flex items-center justify-between pb-3 border-b mb-3">
          <div className="text-sm text-muted-foreground">
            {savedCount}/{totalCount} words saved
            {isExtractingVocab && (
              <span className="ml-2 text-primary">
                (analyzing {vocabProgress.current}/{vocabProgress.total}...)
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSaveAllWords}
            disabled={isAddingAll || savedCount === totalCount || isExtractingVocab}
            className="h-7 text-xs gap-1.5 bg-white/40 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10 hover:bg-white/60 dark:hover:bg-white/10"
          >
            {isAddingAll ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving
              </>
            ) : savedCount === totalCount ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-green-600" />
                Done
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                Save All
                <Badge variant="secondary" className="h-4 px-1 text-[10px] font-medium">
                  {totalCount - savedCount}
                </Badge>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error State */}
      {vocabError && (
        <div className="py-3 px-4 bg-destructive/10 text-destructive text-sm rounded-lg mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {vocabError}
          <Button
            variant="link"
            size="sm"
            className="ml-auto text-destructive p-0 h-auto"
            onClick={extractVocabulary}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Analyzing video content...
              </p>
            </div>
          </div>
        ) : vocabulary.length === 0 && !isExtractingVocab ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mb-3">
                Extract key vocabulary from video
              </p>
              <Button size="sm" onClick={extractVocabulary}>
                <BookOpen className="w-4 h-4 mr-2" />
                Extract Vocabulary
              </Button>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-1.5 pr-2">
              {vocabulary.map((word, index) => (
                <div
                  key={`${word.word}-${index}`}
                  className={`p-2 rounded-md border transition-colors ${
                    word.saved
                      ? 'bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800'
                      : 'bg-card border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex-1 min-w-0">
                      {/* Word and Level */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {word.word}
                        </span>
                        <button
                          onClick={() => speakWord(word.word)}
                          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                          title="发音"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                          levelColors[word.level] || levelColors['Basic']
                        }`}>
                          {word.level}
                        </span>
                      </div>

                      {/* Meaning */}
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {word.meaning}
                      </p>

                      {/* Example */}
                      {word.example && (
                        <p className="text-[11px] text-muted-foreground/70 mt-1 italic leading-relaxed">
                          "{word.example}"
                        </p>
                      )}
                    </div>

                    {/* Save button */}
                    <Button
                      variant={word.saved ? "ghost" : "outline"}
                      size="icon"
                      className={`h-6 w-6 shrink-0 ${
                        word.saved ? 'text-green-600' : ''
                      }`}
                      onClick={() => handleSaveWord(index)}
                      disabled={word.saved || word.saving}
                      title={word.saved ? '已添加到单词本' : '添加到单词本'}
                    >
                      {word.saving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : word.saved ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Auth Dialog for save actions */}
      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} showTrigger={false} />
    </div>
  );
}
