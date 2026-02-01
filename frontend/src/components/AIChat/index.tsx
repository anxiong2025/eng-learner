import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles, Loader2, ChevronDown, StickyNote, Check } from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { useAuthStore } from '@/store/authStore';
import { useNoteStore } from '@/stores/noteStore';
import { askAI } from '@/api/client';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '@/types';
import { AuthDialog } from '@/components/AuthDialog';

const FREE_QUESTION_LIMIT = 3;
const STORAGE_KEY = 'englearner_ai_questions';

type InputMode = 'note' | 'ai';

export function AIChat() {
  const { subtitlesEn, activeSubtitleIndex, videoInfo, currentTime } = useVideoStore();
  const { isAuthenticated } = useAuthStore();
  const { addNote } = useNoteStore();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [mode, setMode] = useState<InputMode>('note');
  const [questionCount, setQuestionCount] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const remainingQuestions = FREE_QUESTION_LIMIT - questionCount;
  const isLimitReached = !isAuthenticated && questionCount >= FREE_QUESTION_LIMIT;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isExpanded]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    if (mode === 'note') {
      await handleSaveNote();
    } else {
      await handleAskAI();
    }
  };

  const handleAskAI = async () => {
    // Check limit for non-authenticated users
    if (!isAuthenticated && questionCount >= FREE_QUESTION_LIMIT) {
      setShowAuthDialog(true);
      return;
    }

    const question = input.trim();
    setInput('');
    setIsExpanded(true);

    // Increment question count for non-authenticated users
    if (!isAuthenticated) {
      const newCount = questionCount + 1;
      setQuestionCount(newCount);
      localStorage.setItem(STORAGE_KEY, newCount.toString());
    }

    // Build context from current and surrounding subtitles
    const contextStart = Math.max(0, activeSubtitleIndex - 2);
    const contextEnd = Math.min(subtitlesEn.length, activeSubtitleIndex + 3);
    const contextSubtitles = subtitlesEn.slice(contextStart, contextEnd);
    const context = contextSubtitles.map(s => s.text).join(' ');

    // Add user message
    const userMessage: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await askAI(context, question);

      const aiMessage: ChatMessageType = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: ChatMessageType = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!input.trim() || !videoInfo) return;

    await addNote({
      video_id: videoInfo.video_id,
      timestamp: currentTime,
      note_text: input.trim(),
    });

    setInput('');
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const handleSaveMessageAsNote = async (content: string) => {
    if (!videoInfo) return;

    await addNote({
      video_id: videoInfo.video_id,
      timestamp: currentTime,
      note_text: content,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!videoInfo) {
    return null;
  }

  const isAIMode = mode === 'ai';

  return (
    <>
      {/* Expandable Chat Drawer - only shows in AI mode with messages */}
      {isAIMode && (
        <div
          className={`border-t border-border bg-background transition-all duration-300 ease-out ${
            isExpanded && messages.length > 0 ? 'h-[280px]' : 'h-0'
          } overflow-hidden`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Assistant</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 hover:bg-muted rounded-md transition-colors"
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="h-[calc(100%-40px)] overflow-y-auto px-4 py-3"
          >
            <div className="space-y-3">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onSaveAsNote={handleSaveMessageAsNote}
                />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-xs">Thinking...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className={`border-t bg-background px-4 py-3 ${isAIMode ? 'border-primary/30' : 'border-border'}`}>
        {isLimitReached && isAIMode ? (
          <div className="text-center py-1">
            <p className="text-xs text-muted-foreground mb-2">
              {FREE_QUESTION_LIMIT} free questions used
            </p>
            <button
              onClick={() => setShowAuthDialog(true)}
              className="text-xs text-primary hover:underline"
            >
              Sign in for unlimited
            </button>
          </div>
        ) : (
          <>
            {/* Textarea Input */}
            <div className={`relative rounded-lg border ${isAIMode ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/30'}`}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isAIMode ? "Ask about the video..." : "Capture your thoughts..."}
                disabled={isLoading}
                rows={1}
                className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 min-h-[40px] max-h-[120px]"
              />

              {/* Bottom bar with mode toggle and submit */}
              <div className="flex items-center justify-between px-2 pb-2">
                {/* Mode Toggle */}
                <button
                  onClick={() => {
                    setMode(isAIMode ? 'note' : 'ai');
                    if (!isAIMode && messages.length > 0) {
                      setIsExpanded(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
                    isAIMode
                      ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      : 'text-primary hover:bg-primary/10'
                  }`}
                >
                  {isAIMode ? (
                    <>
                      <StickyNote className="w-3.5 h-3.5" />
                      <span>Note mode</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ask AI</span>
                    </>
                  )}
                </button>

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isLoading}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                    noteSaved
                      ? 'bg-green-500 text-white'
                      : input.trim() && !isLoading
                        ? isAIMode
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-foreground text-background hover:bg-foreground/90'
                        : 'bg-muted text-muted-foreground/50'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : noteSaved ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Helper text */}
            {isAIMode && !isAuthenticated && remainingQuestions > 0 && remainingQuestions < FREE_QUESTION_LIMIT && (
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                {remainingQuestions} free question{remainingQuestions !== 1 ? 's' : ''} left
              </p>
            )}
          </>
        )}
      </div>

      {/* Auth Dialog */}
      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} showTrigger={false} />
    </>
  );
}
