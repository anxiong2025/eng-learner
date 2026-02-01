import { useState } from 'react';
import { User, Bot, StickyNote, Check } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/types';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: ChatMessageType;
  onSaveAsNote?: (content: string) => Promise<void>;
}

export function ChatMessage({ message, onSaveAsNote }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!onSaveAsNote) return;
    await onSaveAsNote(message.content);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      className={cn(
        "group flex gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg relative",
        isUser ? "bg-primary/5" : "bg-muted/50"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
          <span className="text-xs sm:text-sm font-medium">
            {isUser ? 'You' : 'AI'}
          </span>
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
      </div>

      {/* Save as Note button - appears on hover */}
      {onSaveAsNote && (
        <button
          onClick={handleSave}
          className={cn(
            "absolute top-2 right-2 p-1.5 rounded-md transition-all",
            saved
              ? "bg-green-500 text-white opacity-100"
              : "opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
          title="Save as note"
        >
          {saved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <StickyNote className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
