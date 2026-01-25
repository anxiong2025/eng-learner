import { Bookmark, Lock } from 'lucide-react';
import type { Subtitle, SubtitleMode } from '@/types';
import { useNoteStore } from '@/stores/noteStore';
import { useVideoStore } from '@/stores/videoStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SubtitleLineProps {
  subtitle: Subtitle;
  translation?: string;
  mode: SubtitleMode;
  isActive: boolean;
  isHighlighted: boolean;
  isTranslating?: boolean;
  isUnlocked?: boolean;
}

export function SubtitleLine({
  subtitle,
  translation,
  mode,
  isActive,
  isHighlighted,
  isTranslating,
  isUnlocked = true,
}: SubtitleLineProps) {
  const { addNote } = useNoteStore();
  const { videoInfo, seekTo } = useVideoStore();

  const handleSave = () => {
    if (!videoInfo) return;
    addNote({
      video_id: videoInfo.video_id,
      text: subtitle.text,
      translation: translation,
      timestamp: subtitle.start,
    });
  };

  // Should show Chinese translation?
  const showChinese = mode === 'zh' || mode === 'both';

  return (
    <div
      className={cn(
        "group p-2 sm:p-3 rounded-lg cursor-pointer transition-all duration-200",
        isActive
          ? "bg-primary/5 subtitle-active"
          : "hover:bg-muted/50"
      )}
      onClick={() => seekTo(subtitle.start)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* English text with inline timestamp */}
          {(mode === 'en' || mode === 'both') && (
            <p
              className={cn(
                "text-sm sm:text-base leading-relaxed",
                isHighlighted && "highlight-wavy font-medium"
              )}
            >
              <span className="text-[10px] text-muted-foreground/60 font-mono mr-2">
                {formatTime(subtitle.start)}
              </span>
              {subtitle.text}
            </p>
          )}

          {/* Timestamp only when showing Chinese only */}
          {mode === 'zh' && (
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              {formatTime(subtitle.start)}
            </span>
          )}

          {/* Chinese translation - with masking for unplayed subtitles */}
          {showChinese && (
            <div className={cn(
              "mt-1 text-sm",
              mode === 'both' && "text-xs sm:text-sm"
            )}>
              {isUnlocked ? (
                // Unlocked - show translation
                <p className="text-muted-foreground">
                  {translation || (isTranslating ? (
                    <span className="text-muted-foreground/50 italic">翻译中...</span>
                  ) : null)}
                </p>
              ) : (
                // Locked - show mask
                <div className="flex items-center gap-1.5 text-muted-foreground/40">
                  <Lock className="w-3 h-3" />
                  <span className="text-xs italic">播放后显示翻译</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button - only show for unlocked subtitles */}
        {isUnlocked && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-amber-500 hover:bg-amber-50 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            title="Save to notes"
          >
            <Bookmark className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
