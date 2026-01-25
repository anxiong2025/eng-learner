import { Bookmark } from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { useNoteStore } from '@/stores/noteStore';
import { Button } from '@/components/ui/button';

export function CurrentSubtitle() {
  const { subtitlesEn, translations, activeSubtitleIndex, isTranslating, videoInfo } = useVideoStore();
  const { addNote } = useNoteStore();

  const currentSubtitle = subtitlesEn[activeSubtitleIndex];
  const translation = translations.get(activeSubtitleIndex);

  if (!currentSubtitle) return null;

  const handleSave = () => {
    if (!videoInfo) return;
    addNote({
      video_id: videoInfo.video_id,
      text: currentSubtitle.text,
      translation: translation,
      timestamp: currentSubtitle.start,
    });
  };

  return (
    <div className="px-4 py-3 border-x border-b rounded-b-xl bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-base leading-relaxed">
            {currentSubtitle.text}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {translation || (isTranslating ? (
              <span className="italic">翻译中...</span>
            ) : null)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-amber-500 hover:bg-amber-50 shrink-0"
          onClick={handleSave}
          title="保存到笔记"
        >
          <Bookmark className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
