import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Volume2,
  Send,
  Loader2,
  Check,
  X,
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  generateReviewQuestion,
  submitAIReviewAnswer,
  type ReviewQuestion,
  type ReviewEvaluation,
  type SavedVocabulary,
} from '@/api/client';

interface AIReviewProps {
  vocabulary: SavedVocabulary[];
  onBack: () => void;
  onComplete: () => void;
}

interface Message {
  id: string;
  role: 'ai' | 'user' | 'system';
  content: string;
  isCorrect?: boolean;
  followUp?: string;
}

function speakWord(word: string) {
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
  const audio = new Audio(audioUrl);
  audio.play().catch(err => console.error('Failed to play audio:', err));
}

// Question types for cycling
const QUESTION_TYPES = ['meaning', 'context', 'usage', 'spelling'] as const;

interface RetryItem {
  question: ReviewQuestion;
  retryCount: number;
  lastQuestionType: string;
}

// Get next question type different from the last one
function getNextQuestionType(lastType: string): string {
  const currentIdx = QUESTION_TYPES.indexOf(lastType as typeof QUESTION_TYPES[number]);
  const nextIdx = (currentIdx + 1) % QUESTION_TYPES.length;
  return QUESTION_TYPES[nextIdx];
}

// Generate a different question for retry based on type
function generateRetryQuestion(item: RetryItem): string {
  const { word, meaning, source_sentence } = item.question;
  const newType = getNextQuestionType(item.lastQuestionType);

  switch (newType) {
    case 'meaning':
      return `Let's confirm: what does "${word}" mean?`;
    case 'context':
      return source_sentence
        ? `Do you remember how to use this word? In "${source_sentence}", what does "${word}" express?`
        : `How is "${word}" typically used in conversation?`;
    case 'usage':
      return `Try making a sentence with "${word}"!`;
    case 'spelling':
      return `Listen to the pronunciation and spell this word (hint: it means "${meaning}")`;
    default:
      return `What does "${word}" mean?`;
  }
}

export function AIReview({ vocabulary, onBack: _onBack, onComplete }: AIReviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<ReviewQuestion | null>(null);
  const [currentVocabIndex, setCurrentVocabIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  // Retry mechanism states
  const [retryQueue, setRetryQueue] = useState<RetryItem[]>([]);
  const [isRetryPhase, setIsRetryPhase] = useState(false);
  const [currentRetryItem, setCurrentRetryItem] = useState<RetryItem | null>(null);
  const [newWordFirstPass, setNewWordFirstPass] = useState<Set<number>>(new Set()); // Track new words that passed first time

  // Progressive loading: question buffer for prefetched questions
  const questionBufferRef = useRef<Map<number, ReviewQuestion>>(new Map());
  const prefetchingRef = useRef<Set<number>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Question types for cycling
  const getQuestionType = (index: number): 'meaning' | 'usage' | 'context' | 'spelling' => {
    const types: ('meaning' | 'usage' | 'context' | 'spelling')[] = ['meaning', 'usage', 'context', 'spelling'];
    return types[index % types.length];
  };

  // Prefetch questions for upcoming vocabulary items
  const prefetchQuestions = useCallback(async (startIndex: number, count: number = 3) => {
    for (let i = startIndex; i < Math.min(startIndex + count, vocabulary.length); i++) {
      const vocab = vocabulary[i];
      // Skip if already buffered or currently prefetching
      if (questionBufferRef.current.has(vocab.id) || prefetchingRef.current.has(vocab.id)) {
        continue;
      }

      prefetchingRef.current.add(vocab.id);

      try {
        const question = await generateReviewQuestion({
          vocab_id: vocab.id,
          word: vocab.word,
          meaning: vocab.meaning,
          source_sentence: vocab.source_sentence,
          question_type: getQuestionType(i),
        });
        questionBufferRef.current.set(vocab.id, question);
      } catch (error) {
        console.error(`Failed to prefetch question for ${vocab.word}:`, error);
        // Create a fallback question
        questionBufferRef.current.set(vocab.id, {
          vocab_id: vocab.id,
          word: vocab.word,
          meaning: vocab.meaning,
          source_sentence: vocab.source_sentence,
          question_type: getQuestionType(i),
          question: `What does "${vocab.word}" mean?`,
        });
      } finally {
        prefetchingRef.current.delete(vocab.id);
      }
    }
  }, [vocabulary]);

  // Load a question (from buffer or generate new)
  const loadQuestion = useCallback(async (vocabIndex: number): Promise<ReviewQuestion | null> => {
    if (vocabIndex >= vocabulary.length) return null;

    const vocab = vocabulary[vocabIndex];

    // Check if already in buffer
    if (questionBufferRef.current.has(vocab.id)) {
      return questionBufferRef.current.get(vocab.id)!;
    }

    // Generate on demand
    try {
      const question = await generateReviewQuestion({
        vocab_id: vocab.id,
        word: vocab.word,
        meaning: vocab.meaning,
        source_sentence: vocab.source_sentence,
        question_type: getQuestionType(vocabIndex),
      });
      return question;
    } catch (error) {
      console.error(`Failed to generate question for ${vocab.word}:`, error);
      // Return fallback question
      return {
        vocab_id: vocab.id,
        word: vocab.word,
        meaning: vocab.meaning,
        source_sentence: vocab.source_sentence,
        question_type: getQuestionType(vocabIndex),
        question: `What does "${vocab.word}" mean?`,
      };
    }
  }, [vocabulary]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Initialize AI Review - load first question quickly
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (vocabulary.length === 0) {
        setMessages([{
          id: 'empty',
          role: 'system',
          content: 'No vocabulary to review',
        }]);
        setIsLoading(false);
        return;
      }

      // Add welcome message immediately
      setMessages([{
        id: 'welcome',
        role: 'system',
        content: `AI Review - ${vocabulary.length} words to review`,
      }]);

      try {
        // Load first question
        const firstQuestion = await loadQuestion(0);

        if (cancelled) return;

        if (firstQuestion) {
          setCurrentQuestion(firstQuestion);
          showQuestion(firstQuestion);

          // Start prefetching next questions in background
          prefetchQuestions(1, 3);
        }
      } catch (error: any) {
        if (cancelled) return;
        console.error('Failed to start AI review:', error);
        const errorMsg = error?.response?.data?.error || error?.message || 'Unknown error';
        setMessages(prev => [...prev, {
          id: 'error',
          role: 'system',
          content: `Error: ${errorMsg}`,
        }]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [vocabulary, loadQuestion, prefetchQuestions]);

  const showQuestion = useCallback((question: ReviewQuestion, customContent?: string) => {
    const newMessage: Message = {
      id: `q-${question.vocab_id}-${Date.now()}`,
      role: 'ai',
      content: customContent || question.question,
    };
    setMessages(prev => [...prev, newMessage]);
    setAwaitingAnswer(true);

    // Auto-play audio for spelling questions
    const questionType = customContent ? getNextQuestionType(question.question_type) : question.question_type;
    if (questionType === 'spelling') {
      setTimeout(() => speakWord(question.word), 300);
    }

    // Focus input
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Check if a word is "new" (never reviewed before)
  const isNewWord = useCallback((vocabId: number): boolean => {
    const vocab = vocabulary.find(v => v.id === vocabId);
    return vocab ? vocab.review_count === 0 : false;
  }, [vocabulary]);

  // Process retry queue or complete review
  const processNextStep = useCallback(async () => {
    if (!isRetryPhase && currentVocabIndex >= vocabulary.length - 1) {
      // Initial phase complete, check retry queue
      if (retryQueue.length > 0) {
        setIsRetryPhase(true);
        setMessages(prev => [...prev, {
          id: 'retry-phase',
          role: 'system',
          content: `Let's review ${retryQueue.length} word(s) again...`,
        }]);
        // Start retry phase with first item
        const firstRetry = retryQueue[0];
        setCurrentRetryItem(firstRetry);
        setCurrentQuestion(firstRetry.question);
        setRetryQueue(prev => prev.slice(1));
        const retryQuestionText = generateRetryQuestion(firstRetry);
        setTimeout(() => showQuestion(firstRetry.question, retryQuestionText), 500);
      } else {
        // All done!
        setReviewComplete(true);
        setMessages(prev => [...prev, {
          id: 'complete',
          role: 'system',
          content: `Review complete! ${stats.correct}/${stats.total} correct`,
        }]);
      }
    } else if (isRetryPhase) {
      // In retry phase, check if more items in queue
      if (retryQueue.length > 0) {
        const nextRetry = retryQueue[0];
        setCurrentRetryItem(nextRetry);
        setCurrentQuestion(nextRetry.question);
        setRetryQueue(prev => prev.slice(1));
        const retryQuestionText = generateRetryQuestion(nextRetry);
        setTimeout(() => showQuestion(nextRetry.question, retryQuestionText), 500);
      } else {
        // Retry phase complete
        setReviewComplete(true);
        setMessages(prev => [...prev, {
          id: 'complete',
          role: 'system',
          content: `Review complete! ${stats.correct}/${stats.total} correct`,
        }]);
      }
    } else {
      // Continue initial phase - load next question
      const nextIndex = currentVocabIndex + 1;
      setCurrentVocabIndex(nextIndex);

      // Try to get from buffer first, otherwise load
      const nextQuestion = await loadQuestion(nextIndex);
      if (nextQuestion) {
        setCurrentQuestion(nextQuestion);
        showQuestion(nextQuestion);

        // Prefetch more questions in background
        prefetchQuestions(nextIndex + 1, 3);
      }
    }
  }, [isRetryPhase, currentVocabIndex, vocabulary, retryQueue, stats, showQuestion, loadQuestion, prefetchQuestions]);

  const handleSubmit = async () => {
    if (!input.trim() || !awaitingAnswer || isSubmitting) return;

    const questionToSubmit = isRetryPhase && currentRetryItem
      ? currentRetryItem.question
      : currentQuestion;

    if (!questionToSubmit) return;

    const userAnswer = input.trim();
    setInput('');
    setAwaitingAnswer(false);
    setIsSubmitting(true);

    // Add user message
    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: userAnswer,
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const evaluation = await submitAIReviewAnswer({
        vocab_id: questionToSubmit.vocab_id,
        word: questionToSubmit.word,
        meaning: questionToSubmit.meaning,
        question: questionToSubmit.question,
        user_answer: userAnswer,
      });

      // Update stats
      setStats(prev => ({
        correct: prev.correct + (evaluation.is_correct ? 1 : 0),
        total: prev.total + 1,
      }));

      // Add AI feedback message
      const feedbackMessage: Message = {
        id: `f-${Date.now()}`,
        role: 'ai',
        content: buildFeedbackContent(evaluation, questionToSubmit),
        isCorrect: evaluation.is_correct,
        followUp: evaluation.follow_up || undefined,
      };
      setMessages(prev => [...prev, feedbackMessage]);

      // Handle retry logic
      if (isRetryPhase && currentRetryItem) {
        // In retry phase
        if (!evaluation.is_correct && currentRetryItem.retryCount < 2) {
          // Wrong again, add back to queue with incremented retry count
          const newQuestionType = getNextQuestionType(currentRetryItem.lastQuestionType);
          setRetryQueue(prev => [...prev, {
            question: currentRetryItem.question,
            retryCount: currentRetryItem.retryCount + 1,
            lastQuestionType: newQuestionType,
          }]);
        }
        // Move to next step after delay
        setTimeout(() => {
          setCurrentRetryItem(null);
          processNextStep();
        }, 2000);
      } else {
        // In initial phase
        if (!evaluation.is_correct) {
          // Wrong answer - add to retry queue
          setRetryQueue(prev => [...prev, {
            question: questionToSubmit,
            retryCount: 0,
            lastQuestionType: questionToSubmit.question_type,
          }]);
        } else if (isNewWord(questionToSubmit.vocab_id) && !newWordFirstPass.has(questionToSubmit.vocab_id)) {
          // Correct but new word - add to retry for confirmation
          setNewWordFirstPass(prev => new Set(prev).add(questionToSubmit.vocab_id));
          setRetryQueue(prev => [...prev, {
            question: questionToSubmit,
            retryCount: 0,
            lastQuestionType: questionToSubmit.question_type,
          }]);
        }

        // Move to next step after delay
        setTimeout(() => processNextStep(), 2000);
      }

    } catch (error) {
      console.error('Failed to submit answer:', error);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'ai',
        content: 'Sorry, something went wrong. Let me try again...',
      }]);
      setAwaitingAnswer(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const buildFeedbackContent = (evaluation: ReviewEvaluation, question: ReviewQuestion): string => {
    let content = evaluation.feedback;

    if (!evaluation.is_correct) {
      content += `\n\nAnswer: ${question.word} - ${question.meaning}`;
    }

    if (question.source_sentence) {
      content += `\n\nExample: "${question.source_sentence}"`;
    }

    return content;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Get current question for display (considering retry phase)
  const displayQuestion = isRetryPhase && currentRetryItem
    ? currentRetryItem.question
    : currentQuestion;

  // Progress display
  const getProgressText = () => {
    if (isRetryPhase) {
      const totalRetry = retryQueue.length + (currentRetryItem ? 1 : 0);
      return `Retry: ${totalRetry} left`;
    }
    return `${currentVocabIndex + 1}/${vocabulary.length}`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">AI is preparing your review...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div /> {/* Spacer */}
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {isRetryPhase ? 'Retry Round' : 'AI Review'}
          </span>
          <span className="text-xs text-muted-foreground">
            {getProgressText()}
          </span>
        </div>
        {displayQuestion && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => speakWord(displayQuestion.word)}
          >
            <Volume2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden py-4">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="space-y-3 pr-4">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {isSubmitting && (
              <div className="flex items-center gap-2 text-muted-foreground p-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">AI is thinking...</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input / Complete */}
      <div className="pt-4 border-t">
        {reviewComplete ? (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-lg font-medium">
              <Check className="w-5 h-5 text-green-500" />
              Review Complete!
            </div>
            <p className="text-sm text-muted-foreground">
              {stats.correct}/{stats.total} correct ({Math.round(stats.correct / stats.total * 100)}%)
            </p>
            <Button onClick={onComplete}>Back to Vocabulary</Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={awaitingAnswer ? "Type your answer..." : "Waiting..."}
              disabled={!awaitingAnswer || isSubmitting}
              className="pr-10"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || !awaitingAnswer || isSubmitting}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                input.trim() && awaitingAnswer && !isSubmitting
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground/50"
              )}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Chat bubble component
function ChatBubble({ message }: { message: Message }) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  const isAI = message.role === 'ai';

  return (
    <div className={cn("flex gap-3", !isAI && "flex-row-reverse")}>
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isAI
            ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
            : "bg-primary text-primary-foreground"
        )}
      >
        {isAI ? <Sparkles className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
      </div>
      <div
        className={cn(
          "flex-1 max-w-[80%] p-3 rounded-lg",
          isAI ? "bg-muted/50" : "bg-primary/10",
          message.isCorrect === true && "border-l-4 border-green-500",
          message.isCorrect === false && "border-l-4 border-amber-500"
        )}
      >
        {message.isCorrect !== undefined && (
          <div className={cn(
            "flex items-center gap-1 mb-2 text-xs font-medium",
            message.isCorrect ? "text-green-600" : "text-amber-600"
          )}>
            {message.isCorrect ? (
              <><Check className="w-3 h-3" /> Correct!</>
            ) : (
              <><X className="w-3 h-3" /> Not quite</>
            )}
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
