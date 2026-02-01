import { useState, useEffect } from 'react';
import { Volume2, BookOpen, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { generateMemoryCard, type AIMemoryCard, type SavedVocabulary } from '@/api/client';

interface MemoryCardProps {
  vocabulary: SavedVocabulary;
  onClose: () => void;
}

function speakWord(word: string) {
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
  const audio = new Audio(audioUrl);
  audio.play().catch(err => console.error('Failed to play audio:', err));
}

export function MemoryCard({ vocabulary, onClose }: MemoryCardProps) {
  const [card, setCard] = useState<AIMemoryCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const fetchCard = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await generateMemoryCard({
          word: vocabulary.word,
          meaning: vocabulary.meaning,
          source_sentence: vocabulary.source_sentence,
        });
        setCard(result);
      } catch (err: any) {
        console.error('Failed to generate memory card:', err);
        setError(err?.message || 'Failed to generate memory card');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCard();
  }, [vocabulary]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-base font-medium">Memory Card</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Generating for "{vocabulary.word}"...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <p className="text-sm text-destructive mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : card ? (
          <div
            className="cursor-pointer select-none"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div
              className={cn(
                "transition-all duration-300",
                isFlipped ? "hidden" : "block"
              )}
            >
              {/* Front - Word */}
              <div className="flex flex-col items-center py-12 px-6">
                <h2 className="text-3xl font-semibold tracking-tight mb-1">
                  {card.word}
                </h2>
                {card.phonetic && (
                  <p className="text-sm text-muted-foreground mb-3">{card.phonetic}</p>
                )}
                <div className="flex items-center gap-2 mb-6">
                  {card.part_of_speech && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {card.part_of_speech}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakWord(card.word);
                    }}
                  >
                    <Volume2 className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-lg text-center">{card.meaning}</p>
              </div>
              <div className="border-t px-6 py-3 text-center">
                <span className="text-xs text-muted-foreground">Click to see details</span>
              </div>
            </div>

            <div
              className={cn(
                "transition-all duration-300",
                isFlipped ? "block" : "hidden"
              )}
            >
              {/* Back - Details */}
              <div className="py-6 px-6 space-y-5">
                {card.etymology && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <BookOpen className="w-3.5 h-3.5" />
                      Etymology
                    </div>
                    <p className="text-sm leading-relaxed pl-5">{card.etymology}</p>
                  </div>
                )}

                {card.example_sentence && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Example
                    </div>
                    <p className="text-sm leading-relaxed pl-5 italic text-muted-foreground">
                      {card.example_sentence}
                    </p>
                  </div>
                )}
              </div>
              <div className="border-t px-6 py-3 text-center">
                <span className="text-xs text-muted-foreground">Click to go back</span>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
