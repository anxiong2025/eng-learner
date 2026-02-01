import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  X,
  Minus,
  ArrowUp,
  Loader2,
  Trash2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { useAuthStore } from '@/store/authStore';
import { askAI, RateLimitError } from '@/api/client';
import { AuthDialog } from '@/components/AuthDialog';

const FREE_QUESTION_LIMIT = 5;
const STORAGE_KEY = 'englearner_ai_questions';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Position {
  x: number;
  y: number;
}

export function FloatingAI() {
  const { subtitlesEn } = useVideoStore();
  const { isAuthenticated } = useAuthStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [questionCount, setQuestionCount] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });

  // Dragging state
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const remainingQuestions = FREE_QUESTION_LIMIT - questionCount;
  const isLimitReached = !isAuthenticated && questionCount >= FREE_QUESTION_LIMIT;

  // Calculate bottom-right position
  const getBottomRightPosition = useCallback((forMinimized = false) => {
    const padding = 24;
    if (forMinimized) {
      // Minimized bar is 200px wide
      return { x: window.innerWidth - 200 - padding, y: window.innerHeight - 56 };
    }
    // Full window
    const width = isExpanded ? 380 : 280;
    const height = isExpanded ? 420 : 340;
    return { x: window.innerWidth - width - padding, y: window.innerHeight - height - padding };
  }, [isExpanded]);

  // Initialize position to bottom right
  useEffect(() => {
    setPosition(getBottomRightPosition());
  }, []);

  // Reset to bottom right when opening or changing expanded state
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setPosition(getBottomRightPosition(false));
    }
  }, [isOpen, isMinimized, isExpanded, getBottomRightPosition]);

  // Auto scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  // Auto-minimize after 30 seconds of inactivity
  useEffect(() => {
    if (!isOpen || isMinimized || isLoading) return;

    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsOpen(false);
      }, 30000);
    };

    // Reset timer on any interaction
    const handleActivity = () => resetTimer();

    // Start the timer
    resetTimer();

    // Listen for activity within the container
    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleActivity);
      container.addEventListener('keydown', handleActivity);
      container.addEventListener('click', handleActivity);
    }

    return () => {
      clearTimeout(timer);
      if (container) {
        container.removeEventListener('mousemove', handleActivity);
        container.removeEventListener('keydown', handleActivity);
        container.removeEventListener('click', handleActivity);
      }
    };
  }, [isOpen, isMinimized, isLoading]);

  // Dragging handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, textarea, input')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;

      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;

      let newX = dragRef.current.initialX + deltaX;
      let newY = dragRef.current.initialY + deltaY;

      // Bounds checking
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const containerWidth = containerRef.current?.offsetWidth || 380;
      const containerHeight = containerRef.current?.offsetHeight || 400;

      newX = Math.max(0, Math.min(newX, windowWidth - containerWidth));
      newY = Math.max(0, Math.min(newY, windowHeight - containerHeight));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleSubmit = async (questionOverride?: string) => {
    const question = questionOverride || inputValue.trim();
    if (!question || isLoading) return;

    if (!isAuthenticated && questionCount >= FREE_QUESTION_LIMIT) {
      setShowAuthDialog(true);
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Increment question count
    if (!isAuthenticated) {
      const newCount = questionCount + 1;
      setQuestionCount(newCount);
      localStorage.setItem(STORAGE_KEY, newCount.toString());
    }

    // Build context from all subtitles
    let context = '';
    if (subtitlesEn.length > 0) {
      // Always use all subtitles so user can ask about entire video
      context = subtitlesEn.map(s => s.text).join(' ');
    }

    try {
      const response = await askAI(context || 'No video context available', question);
      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.answer,
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const isRateLimited = error instanceof RateLimitError;
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: isRateLimited
          ? 'Daily AI chat limit reached (20/day). Please try again tomorrow.'
          : 'Sorry, I encountered an error. Please try again.',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Re-focus input after response
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-11 h-11 rounded-full bg-background border border-border shadow-md hover:shadow-lg hover:border-primary/50 hover:scale-105 transition-all flex items-center justify-center z-50"
        title="Ask AI"
      >
        <Sparkles className="w-4.5 h-4.5 text-foreground/70" />
      </button>
    );
  }

  // Minimized state with inline input
  if (isMinimized) {
    return (
      <div
        ref={containerRef}
        style={{ left: position.x, top: position.y, width: 200 }}
        className="fixed z-50"
      >
        <div
          onMouseDown={handleMouseDown}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-xl bg-background border border-border shadow-md ${isDragging ? 'cursor-grabbing' : ''}`}
        >
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputValue.trim()) {
                handleSubmit();
                setIsMinimized(false);
              }
            }}
            placeholder="Ask..."
            className="flex-1 text-xs bg-transparent border-none outline-none placeholder:text-muted-foreground/60"
          />
          {inputValue.trim() ? (
            <button
              onClick={() => {
                handleSubmit();
                setIsMinimized(false);
              }}
              className="p-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsMinimized(false)}
                className="p-0.5 hover:bg-muted rounded transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-0.5 hover:bg-muted rounded transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const windowWidth = isExpanded ? 380 : 280;
  const windowHeight = isExpanded ? 420 : 340;

  return (
    <>
      <div
        ref={containerRef}
        style={{
          left: position.x,
          top: position.y,
          width: windowWidth,
          height: windowHeight,
        }}
        className={`fixed z-50 flex flex-col rounded-2xl overflow-hidden shadow-lg border border-border bg-background ${isDragging ? 'select-none' : ''}`}
      >
        {/* Header - Draggable */}
        <div
          onMouseDown={handleMouseDown}
          className={`flex items-center justify-between px-3 py-2 border-b border-border ${isDragging ? 'cursor-grabbing' : 'cursor-move'}`}
        >
          <span className="text-xs font-medium text-foreground">Chat</span>
          <div className="flex items-center gap-0.5">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                title="Clear chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
              title={isExpanded ? 'Shrink' : 'Expand'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => {
                setIsMinimized(true);
                setPosition(getBottomRightPosition(true));
              }}
              className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>


        {/* Chat messages */}
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto p-3 space-y-2.5"
        >
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-[11px] text-muted-foreground">Ask anything about the video</p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : ''}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <Sparkles className="w-3 h-3 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={`px-2.5 py-1.5 rounded-xl text-xs ${
                      message.role === 'user'
                        ? 'max-w-[80%] bg-primary text-primary-foreground rounded-tr-sm'
                        : 'max-w-[85%] bg-muted rounded-tl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Sparkles className="w-3 h-3 text-primary-foreground" />
                  </div>
                  <div className="px-2.5 py-1.5 rounded-xl rounded-tl-sm bg-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input area */}
        <div className="p-2.5 border-t border-border/50 bg-muted/30">
          <div className="relative flex items-center">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLimitReached ? "Sign in to continue..." : "Ask a question..."}
              disabled={isLoading || isLimitReached}
              rows={1}
              className="w-full pl-3 pr-9 py-2 text-xs bg-background border border-border rounded-xl resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50 transition-all"
              style={{ minHeight: '36px', maxHeight: '80px' }}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!inputValue.trim() || isLoading || isLimitReached}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                inputValue.trim() && !isLoading && !isLimitReached
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArrowUp className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Usage hint */}
          {!isAuthenticated && (
            <p className="text-[9px] text-muted-foreground text-center mt-1.5">
              {isLimitReached ? (
                <button onClick={() => setShowAuthDialog(true)} className="text-primary hover:underline">
                  Sign in for unlimited questions
                </button>
              ) : (
                <span>{remainingQuestions} free question{remainingQuestions !== 1 ? 's' : ''} remaining</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Auth Dialog */}
      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} showTrigger={false} />
    </>
  );
}
