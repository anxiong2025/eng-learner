import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { useNoteStore } from '@/stores/noteStore';
import { useAuthStore } from '@/store/authStore';
import { NoteInput } from '@/components/NoteInput';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AuthDialog } from '@/components/AuthDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function CurrentSubtitle() {
  const { subtitlesEn, translations, activeSubtitleIndex, isTranslating, videoInfo, showSubtitle, currentTime } = useVideoStore();
  const { addNote, addQuickNote } = useNoteStore();
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const currentSubtitle = subtitlesEn[activeSubtitleIndex];
  const translation = translations.get(activeSubtitleIndex);
  const hasSubtitle = !!currentSubtitle;

  const handleSaveSubtitle = () => {
    if (!videoInfo || !hasSubtitle) return;
    addNote({
      video_id: videoInfo.video_id,
      english: currentSubtitle.text,
      chinese: translation,
      timestamp: currentSubtitle.start,
    });
  };

  const handleNoteSubmit = (content: string, images?: string[]) => {
    if (!videoInfo) return;
    addQuickNote(videoInfo.video_id, currentTime, content, images);
    toast('Note saved', 'success');
  };

  const handleLoginRequired = () => {
    setShowLoginDialog(true);
  };

  return (
    <div className="mt-2 sm:mt-3 space-y-2 flex-1 overflow-auto min-h-0">
      {/* Subtitle card - only show when enabled */}
      {showSubtitle && (
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border rounded-xl bg-muted/30">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              {hasSubtitle ? (
                <>
                  <p className="text-xs leading-relaxed">
                    {currentSubtitle.text}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {translation || (isTranslating ? (
                      <span className="italic">Translating...</span>
                    ) : null)}
                  </p>
                </>
              ) : (
                <p className="text-xs sm:text-sm text-muted-foreground italic">
                  Waiting for subtitle...
                </p>
              )}
            </div>
            {hasSubtitle && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 sm:h-8 sm:w-8 shrink-0 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 active:bg-amber-500/20"
                    onClick={handleSaveSubtitle}
                  >
                    <Bookmark className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save subtitle</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {/* Note input */}
      <NoteInput
        onSubmit={handleNoteSubmit}
        placeholder="Capture your thoughts..."
        disabled={!isAuthenticated}
        onLoginRequired={handleLoginRequired}
      />

      {/* Login dialog - triggered when trying to send without login */}
      <AuthDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        showTrigger={false}
      />
    </div>
  );
}
