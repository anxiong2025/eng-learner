import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ImagePlus, ArrowUp, X } from 'lucide-react';

interface NoteInputProps {
  onSubmit: (content: string, images?: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onLoginRequired?: () => void;
}

export function NoteInput({
  onSubmit,
  placeholder = '现在的想法是...',
  className,
  disabled = false,
  onLoginRequired
}: NoteInputProps) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore draft from localStorage on mount (after login redirect)
  useEffect(() => {
    const draft = localStorage.getItem('note-draft');
    if (draft && !disabled) {
      try {
        const { text: draftText, images: draftImages } = JSON.parse(draft);
        if (draftText) setText(draftText);
        if (draftImages && Array.isArray(draftImages)) setImages(draftImages);
        // Clear draft after restoring
        localStorage.removeItem('note-draft');
      } catch {
        localStorage.removeItem('note-draft');
      }
    }
  }, [disabled]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  // Handle image upload (max 2 images)
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = 2 - images.length;
    if (remainingSlots <= 0) return;

    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    filesToProcess.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setImages(prev => {
              if (prev.length >= 2) return prev;
              return [...prev, event.target!.result as string];
            });
          }
        };
        reader.readAsDataURL(file);
      }
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [images.length]);

  // Remove image
  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Handle paste (for images)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file && images.length < 2) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setImages(prev => {
                if (prev.length >= 2) return prev;
                return [...prev, event.target!.result as string];
              });
            }
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  }, [images.length]);

  // Submit note
  const handleSubmit = useCallback(() => {
    const finalText = text.trim();
    if (!finalText && images.length === 0) return;

    // Check if login required - save draft before prompting login
    if (disabled && onLoginRequired) {
      // Save draft to localStorage so it can be restored after login
      localStorage.setItem('note-draft', JSON.stringify({ text: finalText, images }));
      onLoginRequired();
      return;
    }

    onSubmit(finalText, images.length > 0 ? images : undefined);
    setText('');
    setImages([]);
    // Clear draft after successful submit
    localStorage.removeItem('note-draft');
  }, [text, images, onSubmit, disabled, onLoginRequired]);

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && (text.trim() || images.length > 0)) {
      e.preventDefault();
      handleSubmit();
    }
  }, [text, images.length, handleSubmit]);

  const hasContent = text.trim() || images.length > 0;

  return (
    <div className={cn('relative', className)}>
      {/* Main input area */}
      <div className="rounded-2xl border border-border bg-background shadow-sm overflow-hidden">
        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          className="w-full px-4 pt-4 pb-2 text-sm bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/60 min-h-[60px]"
        />

        {/* Image previews - inside input box, above toolbar */}
        {images.length > 0 && (
          <div className="flex gap-2 px-3 pb-2 overflow-x-auto">
            {images.map((img, index) => (
              <div key={index} className="relative group shrink-0">
                <img
                  src={img}
                  alt={`Preview ${index + 1}`}
                  className="h-12 w-12 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 pb-2">
          {/* Left: Image button + Beta badge */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= 2}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                images.length >= 2
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              title={images.length >= 2 ? "最多插入2张图片" : "插入图片"}
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              Beta
            </span>
          </div>

          {/* Right: Send button */}
          <button
            onClick={handleSubmit}
            disabled={!hasContent}
            className={cn(
              'p-2.5 rounded-full transition-all',
              hasContent
                ? 'text-primary hover:bg-primary/10'
                : 'text-muted-foreground/30 cursor-not-allowed'
            )}
            title="发送"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );
}
