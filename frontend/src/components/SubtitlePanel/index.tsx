import { useRef, useEffect } from 'react';
import { MessageSquareText, Loader2, AlertCircle } from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { SubtitleLine } from './SubtitleLine';
import { SubtitleModeSwitch } from './SubtitleModeSwitch';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export function SubtitlePanel() {
  const {
    subtitlesEn,
    translations,
    subtitleMode,
    setSubtitleMode,
    activeSubtitleIndex,
    highlightedIndices,
    videoInfo,
    isLoading,
    isTranslating,
    maxPlayedIndex,
    translatedUpTo,
  } = useVideoStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active subtitle
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const element = activeLineRef.current;

      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      const isVisible =
        elementRect.top >= containerRect.top &&
        elementRect.bottom <= containerRect.bottom;

      if (!isVisible) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSubtitleIndex]);

  if (!videoInfo) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center p-8">
          <MessageSquareText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">Subtitles will appear here</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-muted-foreground">Loading subtitles...</p>
        </CardContent>
      </Card>
    );
  }

  if (subtitlesEn.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center p-8">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">No subtitles available for this video</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate translation progress
  const translatedCount = translations.size;
  const totalCount = subtitlesEn.length;

  return (
    <Card className="h-full flex flex-col">
      {/* Compact Header - just language switch and stats */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{subtitlesEn.length} sentences</span>
          {isTranslating && (
            <span className="flex items-center gap-1 text-blue-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              {translatedCount}/{totalCount}
            </span>
          )}
          {highlightedIndices.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] px-1.5 py-0">
              {highlightedIndices.length} highlights
            </Badge>
          )}
        </div>
        <SubtitleModeSwitch mode={subtitleMode} onChange={setSubtitleMode} />
      </div>

      {/* Subtitle List */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full" ref={containerRef}>
          <div className="p-3 sm:p-4 pt-0 space-y-1">
            {subtitlesEn.map((subtitle, index) => {
              const isActive = index === activeSubtitleIndex;
              const isHighlighted = highlightedIndices.includes(index);
              const translation = translations.get(index);
              const isUnlocked = index <= maxPlayedIndex;

              return (
                <div
                  key={subtitle.index}
                  ref={isActive ? activeLineRef : null}
                >
                  <SubtitleLine
                    subtitle={subtitle}
                    translation={translation}
                    mode={subtitleMode}
                    isActive={isActive}
                    isHighlighted={isHighlighted}
                    isTranslating={isTranslating && index <= translatedUpTo + 15 && !translation}
                    isUnlocked={isUnlocked}
                  />
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
