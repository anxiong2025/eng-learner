import { useEffect, useRef, useMemo, useState } from 'react';
import { useVideoStore } from '@/stores/videoStore';
import { useNoteStore } from '@/stores/noteStore';
import { Loader2, Eye, EyeOff, ChevronDown, ChevronRight, List, Bookmark, Check, X, RefreshCw } from 'lucide-react';
import type { Subtitle } from '@/types';

// Format seconds to mm:ss
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Merged subtitle group
interface MergedSubtitle {
  text: string;
  translation: string;
  start: number;
  end: number;
  originalIndices: number[];
}

// Check if translation is valid (not empty or failed)
function isValidTranslation(text: string): boolean {
  if (!text || text.trim() === '') return false;
  // Filter out failed translations (Chinese error text)
  if (text.includes('Translation failed')) return false;
  return true;
}

// Merge subtitles into complete sentences
function mergeSubtitles(
  subtitles: Subtitle[],
  translations: Map<number, string>
): MergedSubtitle[] {
  if (subtitles.length === 0) return [];

  const merged: MergedSubtitle[] = [];
  let currentGroup: MergedSubtitle = {
    text: '',
    translation: '',
    start: subtitles[0].start,
    end: subtitles[0].end,
    originalIndices: [],
  };

  for (let i = 0; i < subtitles.length; i++) {
    const sub = subtitles[i];
    const rawTrans = translations.get(i) || '';
    // Filter out invalid translations
    const trans = isValidTranslation(rawTrans) ? rawTrans : '';

    if (currentGroup.text === '') {
      // Start new group
      currentGroup.text = sub.text;
      currentGroup.translation = trans;
      currentGroup.start = sub.start;
      currentGroup.end = sub.end;
      currentGroup.originalIndices = [i];
    } else {
      // Check if we should merge or start new
      const lastChar = currentGroup.text.trim().slice(-1);
      const endsWithPunctuation = /[.!?。！？]$/.test(lastChar);
      const timeDiff = sub.start - currentGroup.end;

      // Start new group if: ends with punctuation, or gap > 2 seconds, or text is getting too long
      if (endsWithPunctuation || timeDiff > 2 || currentGroup.text.length > 200) {
        merged.push({ ...currentGroup });
        currentGroup = {
          text: sub.text,
          translation: trans,
          start: sub.start,
          end: sub.end,
          originalIndices: [i],
        };
      } else {
        // Merge into current group
        currentGroup.text += ' ' + sub.text;
        currentGroup.translation += trans ? ' ' + trans : '';
        currentGroup.end = sub.end;
        currentGroup.originalIndices.push(i);
      }
    }
  }

  // Don't forget the last group
  if (currentGroup.text) {
    merged.push(currentGroup);
  }

  return merged;
}

export function TranscriptPanel() {
  const {
    subtitlesEn,
    activeSubtitleIndex,
    translations,
    isTranslating,
    seekTo,
    togglePlay,
    chapters,
    isGeneratingChapters,
    currentTime,
    videoInfo,
    retryTranslation
  } = useVideoStore();

  const { addNote, addReply } = useNoteStore();

  // Toggle for showing/hiding translations
  const [showTranslation, setShowTranslation] = useState(true);
  // Toggle for showing/hiding chapters (collapsed by default)
  const [showChapters, setShowChapters] = useState(false);
  // Active note input index
  const [noteInputIndex, setNoteInputIndex] = useState<number | null>(null);
  // Track which segments are being retried
  const [retryingIndices, setRetryingIndices] = useState<Set<number>>(new Set());
  const [noteComment, setNoteComment] = useState('');
  const noteInputRef = useRef<HTMLInputElement>(null);

  // Focus note input when shown
  useEffect(() => {
    if (noteInputIndex !== null && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [noteInputIndex]);

  // Handle saving note
  const handleSaveNote = async (merged: MergedSubtitle) => {
    if (!videoInfo) return;

    await addNote({
      video_id: videoInfo.video_id,
      english: merged.text,
      chinese: merged.translation || undefined,
      timestamp: merged.start,
    });

    // If has comment, add as reply
    if (noteComment.trim()) {
      setTimeout(() => {
        const notes = useNoteStore.getState().notes;
        const lastNote = notes[notes.length - 1];
        if (lastNote) {
          addReply(lastNote.id, noteComment.trim());
        }
      }, 50);
    }

    setNoteInputIndex(null);
    setNoteComment('');
  };

  // Find active chapter based on current time
  const activeChapterIndex = useMemo(() => {
    if (chapters.length === 0) return -1;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (currentTime >= chapters[i].start_time) {
        return i;
      }
    }
    return 0;
  }, [chapters, currentTime]);

  // Merge subtitles into sentences
  const mergedSubtitles = useMemo(
    () => mergeSubtitles(subtitlesEn, translations),
    [subtitlesEn, translations]
  );

  // Find active merged index
  const activeMergedIndex = useMemo(() => {
    return mergedSubtitles.findIndex(m => m.originalIndices.includes(activeSubtitleIndex));
  }, [mergedSubtitles, activeSubtitleIndex]);

  const activeRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active subtitle within the scroll container only
  useEffect(() => {
    if (activeRef.current && scrollAreaRef.current) {
      const container = scrollAreaRef.current;
      const activeElement = activeRef.current;

      // Calculate scroll position to center the active element
      const containerHeight = container.clientHeight;
      const elementTop = activeElement.offsetTop;
      const elementHeight = activeElement.clientHeight;
      const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);

      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: 'smooth'
      });
    }
  }, [activeMergedIndex]);

  if (subtitlesEn.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Loading transcript...</p>
      </div>
    );
  }

  // Check if any subtitle in the group is being translated
  const isGroupTranslating = (group: MergedSubtitle) => {
    if (!isTranslating) return false;
    const maxIndex = Math.max(...group.originalIndices);
    return maxIndex <= activeSubtitleIndex + 10 && !group.translation;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header: Contents toggle + Translation toggle */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
        {/* Contents toggle */}
        {(chapters.length > 0 || isGeneratingChapters) ? (
          <button
            onClick={() => setShowChapters(!showChapters)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showChapters ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <List className="w-3.5 h-3.5" />
            <span>Contents</span>
            {isGeneratingChapters && (
              <Loader2 className="w-3 h-3 animate-spin ml-1" />
            )}
          </button>
        ) : (
          <div />
        )}

        {/* Translation toggle */}
        <button
          onClick={() => setShowTranslation(!showTranslation)}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
          title={showTranslation ? 'Hide translation' : 'Show translation'}
        >
          {showTranslation ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
          <span>Translation</span>
        </button>
      </div>

      {/* Chapters list (expandable, scrollable) */}
      {showChapters && chapters.length > 0 && (
        <div className="mb-2 pb-2 border-b border-border/50 space-y-0.5 max-h-48 overflow-y-auto">
          {chapters.map((chapter, index) => (
            <button
              key={index}
              onClick={() => seekTo(chapter.start_time)}
              className={`flex items-center gap-2 w-full text-left py-1 px-2 rounded text-xs transition-all duration-150 ${
                index === activeChapterIndex
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white hover:-translate-y-0.5 hover:shadow-md'
              }`}
            >
              <span className="font-mono text-[10px] w-8 shrink-0">
                {formatTime(chapter.start_time)}
              </span>
              <span className="truncate">{chapter.title}</span>
              {index === activeChapterIndex && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 ml-auto" />
              )}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
        <div className="space-y-0.5 pr-2">
          {mergedSubtitles.map((merged, index) => {
            const isActive = index === activeMergedIndex;

            return (
              <div
                key={index}
                ref={isActive ? activeRef : null}
                onClick={() => seekTo(merged.start)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  togglePlay();
                }}
                className={`group py-1.5 px-3 rounded-md cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-muted/60'
                    : 'hover:bg-muted/50'
                }`}
              >
                {/* Timestamp row with bookmark button */}
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-mono ${isActive ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-primary'}`}>
                    {formatTime(merged.start)}
                  </span>
                  {/* Bookmark button - shows on hover */}
                  {noteInputIndex !== index && (
                    <button
                      className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-amber-500 hover:bg-amber-500/10 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNoteInputIndex(index);
                      }}
                      title="Save to notes"
                    >
                      <Bookmark className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Note input */}
                {noteInputIndex === index && (
                  <div
                    className="flex items-center gap-1.5 my-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      ref={noteInputRef}
                      type="text"
                      value={noteComment}
                      onChange={(e) => setNoteComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveNote(merged);
                        } else if (e.key === 'Escape') {
                          setNoteInputIndex(null);
                          setNoteComment('');
                        }
                      }}
                      placeholder="Add note..."
                      className="flex-1 text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      className="h-5 w-5 rounded flex items-center justify-center text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveNote(merged);
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNoteInputIndex(null);
                        setNoteComment('');
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* English text */}
                <p className={`text-xs leading-relaxed mt-0.5 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {merged.text}
                </p>

                {/* Translation - shown separately when enabled */}
                {showTranslation && merged.translation && (
                  <p className={`text-xs leading-relaxed mt-1 ${isActive ? 'text-primary/90' : 'text-muted-foreground/70'}`}>
                    {merged.translation}
                  </p>
                )}
                {showTranslation && !merged.translation && isGroupTranslating(merged) && (
                  <span className="inline-flex items-center gap-1 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Translating...</span>
                  </span>
                )}
                {/* Retry button - show when no translation and not currently translating */}
                {showTranslation && !merged.translation && !isGroupTranslating(merged) && (
                  <button
                    className="inline-flex items-center gap-1 mt-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const indices = merged.originalIndices;
                      setRetryingIndices(prev => new Set([...prev, ...indices]));
                      try {
                        await retryTranslation(indices);
                      } finally {
                        setRetryingIndices(prev => {
                          const next = new Set(prev);
                          indices.forEach(i => next.delete(i));
                          return next;
                        });
                      }
                    }}
                    disabled={retryingIndices.has(merged.originalIndices[0])}
                  >
                    {retryingIndices.has(merged.originalIndices[0]) ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Retrying...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry translation</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
