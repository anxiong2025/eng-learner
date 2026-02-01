import { useState, useRef, useEffect } from 'react';
import { Bookmark, Lock, X, Check } from 'lucide-react';
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
  const { addNote, addReply } = useNoteStore();
  const { videoInfo, seekTo } = useVideoStore();
  const [showInput, setShowInput] = useState(false);
  const [comment, setComment] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when shown
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const handleSave = async () => {
    if (!videoInfo) return;

    await addNote({
      video_id: videoInfo.video_id,
      english: subtitle.text,
      chinese: translation,
      timestamp: subtitle.start,
    });

    // If has comment, add as reply (need to find the note just added)
    if (comment.trim()) {
      // Small delay to ensure note is added
      setTimeout(() => {
        const notes = useNoteStore.getState().notes;
        const lastNote = notes[notes.length - 1];
        if (lastNote) {
          addReply(lastNote.id, comment.trim());
        }
      }, 50);
    }

    setShowInput(false);
    setComment('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setShowInput(false);
      setComment('');
    }
  };

  // Should show Chinese translation?
  const showChinese = mode === 'zh' || mode === 'both';

  return (
    <div
      className={cn(
        "group p-2 sm:p-3 rounded-lg cursor-pointer transition-all duration-150",
        isActive
          ? "bg-primary/5 subtitle-active"
          : "hover:bg-muted/50 hover:scale-[1.01] hover:shadow-sm"
      )}
      onClick={() => seekTo(subtitle.start)}
    >
      {/* Timestamp row with save button */}
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-muted-foreground/60 font-mono">
          {formatTime(subtitle.start)}
        </span>
        {/* Save button - always visible for now */}
        {isUnlocked && !showInput && (
          <button
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowInput(true);
            }}
            title="Save to notes"
          >
            <Bookmark className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Comment input for note */}
      {showInput && (
        <div
          className="flex items-center gap-1.5 mb-2 animate-in fade-in slide-in-from-top-1 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add note..."
            className="flex-1 text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={handleSave}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setShowInput(false);
              setComment('');
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* English text */}
        {(mode === 'en' || mode === 'both') && (
          <p
            className={cn(
              "text-sm sm:text-base leading-relaxed",
              isHighlighted && "highlight-wavy font-medium",
              isHighlighted && isActive && "highlight-active"
            )}
          >
            {subtitle.text}
          </p>
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
                  <span className="text-muted-foreground/50 italic">Translating...</span>
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
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
