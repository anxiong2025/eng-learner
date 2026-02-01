import { useState, useEffect } from 'react';
import { BookOpen, Volume2, Loader2, MessageCircle, Star } from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { extractVocabulary, saveVocabulary } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { VocabularyItem } from '@/types';

const levelColors: Record<string, string> = {
  'IELTS': 'bg-purple-100 text-purple-700 border-purple-200',
  'TOEFL': 'bg-blue-100 text-blue-700 border-blue-200',
  'CET-4': 'bg-green-100 text-green-700 border-green-200',
  'CET-6': 'bg-amber-100 text-amber-700 border-amber-200',
  'Basic': 'bg-gray-100 text-gray-700 border-gray-200',
};

// Speak word using Youdao Dictionary audio
function speakWord(word: string) {
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
  const audio = new Audio(audioUrl);
  audio.play().catch(err => {
    console.error('Failed to play audio:', err);
  });
}

export function VocabularyCard() {
  const { subtitlesEn, activeSubtitleIndex, videoInfo } = useVideoStore();
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastAnalyzedIndex, setLastAnalyzedIndex] = useState(-1);
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
  const [savingWord, setSavingWord] = useState<string | null>(null);

  const currentSubtitle = subtitlesEn[activeSubtitleIndex];

  // Fetch vocabulary when subtitle changes
  useEffect(() => {
    if (!currentSubtitle || activeSubtitleIndex === lastAnalyzedIndex) return;

    const fetchVocabulary = async () => {
      setIsLoading(true);
      try {
        const result = await extractVocabulary(currentSubtitle.text);
        setVocabulary(result.vocabulary);
        setLastAnalyzedIndex(activeSubtitleIndex);
      } catch (error) {
        console.error('Failed to extract vocabulary:', error);
        setVocabulary([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce to avoid too many requests
    const timer = setTimeout(fetchVocabulary, 500);
    return () => clearTimeout(timer);
  }, [currentSubtitle, activeSubtitleIndex, lastAnalyzedIndex]);

  const handleSaveWord = async (item: VocabularyItem) => {
    if (savedWords.has(item.word) || savingWord === item.word) return;

    setSavingWord(item.word);
    try {
      await saveVocabulary({
        word: item.word,
        meaning: item.meaning,
        level: item.level,
        example: item.example,
        source_video_id: videoInfo?.video_id,
        source_sentence: currentSubtitle?.text,
      });
      setSavedWords(prev => new Set(prev).add(item.word));
    } catch (error) {
      console.error('Failed to save vocabulary:', error);
    } finally {
      setSavingWord(null);
    }
  };

  if (!videoInfo) return null;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-500" />
          Key Vocabulary
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto px-4 pb-4">
        {vocabulary.length === 0 && !isLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No key vocabulary in current sentence</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vocabulary.map((item, index) => {
              const isSaved = savedWords.has(item.word);
              const isSaving = savingWord === item.word;

              return (
                <div
                  key={`${item.word}-${index}`}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">{item.word}</span>
                        <button
                          onClick={() => speakWord(item.word)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                          title="Pronounce"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleSaveWord(item)}
                          disabled={isSaved || isSaving}
                          className={`p-1 rounded transition-colors ${
                            isSaved
                              ? 'text-amber-500'
                              : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-50'
                          }`}
                          title={isSaved ? 'Saved' : 'Save word'}
                        >
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Star className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
                          )}
                        </button>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${levelColors[item.level] || levelColors['Basic']}`}
                        >
                          {item.level}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.meaning}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-start gap-2 text-sm bg-muted/50 rounded-md p-2">
                    <MessageCircle className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
                    <p className="text-muted-foreground italic">"{item.example}"</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
