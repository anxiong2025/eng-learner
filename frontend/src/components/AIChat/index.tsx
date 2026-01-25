import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, MessageCircle } from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { askAI } from '@/api/client';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export function AIChat() {
  const { subtitlesEn, activeSubtitleIndex, videoInfo, playerState } = useVideoStore();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isPaused = playerState === 'paused';

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    setInput('');

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!videoInfo) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center p-8">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">Load a video to start asking questions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 sm:pb-3 px-3 sm:px-6">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          Ask AI
        </CardTitle>
        {isPaused && (
          <Badge variant="outline" className="text-[10px] sm:text-xs bg-green-50 text-green-700 border-green-200">
            Ready to ask
          </Badge>
        )}
      </CardHeader>

      {/* Chat Messages */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-3 sm:p-4 pt-0 space-y-2 sm:space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-4 sm:py-8">
                <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 sm:mb-3 text-muted-foreground/50" />
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Pause the video and ask questions about the content
                </p>
                <div className="mt-3 sm:mt-4 space-y-2">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Try asking:</p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center px-2">
                    {['What does this mean?', 'Explain the grammar', 'Give me examples'].map((q) => (
                      <Button
                        key={q}
                        variant="outline"
                        size="sm"
                        className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3"
                        onClick={() => setInput(q)}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))
            )}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground p-2 sm:p-3">
                <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                <span className="text-xs sm:text-sm">Thinking...</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Input */}
      <div className="p-2 sm:p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the current sentence..."
            disabled={isLoading}
            className="flex-1 h-9 sm:h-10 text-sm"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-9 w-9 sm:h-10 sm:w-10"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
