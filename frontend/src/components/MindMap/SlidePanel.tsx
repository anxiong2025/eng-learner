import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Presentation,
  Loader2,
  Check,
  Circle,
  Maximize2,
  Minimize2,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useVideoStore } from '@/stores/videoStore';
import { generateSlides } from '@/api/client';
import { Button } from '@/components/ui/button';
import { LoginGate } from '@/components/ProFeatureGate';
import type { Slide } from '@/types';

interface GenerationStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

const GENERATION_STEPS: GenerationStep[] = [
  { id: 'collect', label: 'Collecting content', status: 'pending' },
  { id: 'analyze', label: 'Analyzing structure', status: 'pending' },
  { id: 'design', label: 'Designing slides', status: 'pending' },
  { id: 'generate', label: 'Generating notes', status: 'pending' },
  { id: 'render', label: 'Rendering preview', status: 'pending' },
];

export function SlidePanel() {
  const { subtitlesEn, videoInfo, translations, slidesContent, setSlidesContent, isGeneratingSlides, setIsGeneratingSlides } = useVideoStore();
  const [steps, setSteps] = useState<GenerationStep[]>(GENERATION_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<'scroll' | 'present'>('scroll');
  const containerRef = useRef<HTMLDivElement>(null);

  const updateStep = (stepId: string, status: GenerationStep['status']) => {
    setSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, status } : s
    ));
  };

  const resetSteps = () => {
    setSteps(GENERATION_STEPS.map(s => ({ ...s, status: 'pending' })));
  };

  const generateSlidesContent = useCallback(async (regenerate = false) => {
    if (!videoInfo || subtitlesEn.length === 0) return;

    setIsGeneratingSlides(true);
    setError(null);
    if (regenerate) {
      setSlidesContent(null);
    }
    resetSteps();

    try {
      updateStep('collect', 'running');
      await new Promise(r => setTimeout(r, 300));

      const content = subtitlesEn.map((sub, i) => {
        const translation = translations.get(i);
        return translation ? `${sub.text} (${translation})` : sub.text;
      }).join('\n');

      updateStep('collect', 'done');
      updateStep('analyze', 'running');
      await new Promise(r => setTimeout(r, 200));
      updateStep('analyze', 'done');

      updateStep('design', 'running');
      const result = await generateSlides(videoInfo.video_id, videoInfo.title, content, regenerate);

      // Filter out empty slides (non-title slides with no bullets)
      const filteredSlides = result.slides.filter(slide =>
        slide.slide_type === 'title' || (slide.bullets && slide.bullets.length > 0)
      );

      // If cached result returned quickly, skip animation
      if (result.cached) {
        setSlidesContent(filteredSlides);
        setSteps(GENERATION_STEPS.map(s => ({ ...s, status: 'done' })));
      } else {
        updateStep('design', 'done');

        updateStep('generate', 'running');
        await new Promise(r => setTimeout(r, 200));
        updateStep('generate', 'done');

        updateStep('render', 'running');
        setSlidesContent(filteredSlides);
        await new Promise(r => setTimeout(r, 300));
        updateStep('render', 'done');
      }

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate slides');
      resetSteps();
    } finally {
      setIsGeneratingSlides(false);
    }
  }, [videoInfo, subtitlesEn, translations, setSlidesContent, setIsGeneratingSlides]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen(prev => !prev);
      } else if (viewMode === 'present' && slidesContent) {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          setCurrentSlide(prev => Math.min(prev + 1, slidesContent.length - 1));
        } else if (e.key === 'ArrowLeft') {
          setCurrentSlide(prev => Math.max(prev - 1, 0));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, viewMode, slidesContent]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
        setViewMode('present');
      } catch (e) {
        console.error('Fullscreen failed:', e);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (e) {
        console.error('Exit fullscreen failed:', e);
      }
    }
  };

  const handleRegenerate = () => {
    generateSlidesContent(true); // Force regenerate, skip cache
  };

  // Auto-load cached slides on mount
  useEffect(() => {
    if (videoInfo && subtitlesEn.length > 0 && !slidesContent && !isGeneratingSlides) {
      generateSlidesContent(false); // Try to load from cache
    }
  }, [videoInfo?.video_id]); // Only run when video changes

  if (!videoInfo) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Load a video to generate slides</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`h-full flex flex-col ${isFullscreen ? 'bg-slate-950' : ''}`}>
      {/* Progress Steps */}
      {isGeneratingSlides && (
        <div className="py-4 border-b bg-gradient-to-r from-violet-500/5 to-indigo-500/5">
          <div className="flex flex-col gap-2">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-2">
                {step.status === 'done' ? (
                  <div className="w-4 h-4 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm shadow-emerald-500/30">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                ) : step.status === 'running' ? (
                  <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/30" />
                )}
                <span className={`text-xs ${
                  step.status === 'running' ? 'text-violet-600 font-medium' :
                  step.status === 'done' ? 'text-emerald-600' :
                  'text-muted-foreground/50'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="py-3 px-4 bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-lg mx-2 mt-2">
          {error}
          <Button variant="link" size="sm" className="ml-2 text-red-600 hover:text-red-700" onClick={handleRegenerate}>
            Retry
          </Button>
        </div>
      )}

      {/* Slide Display */}
      {slidesContent && slidesContent.length > 0 ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/70">
                {slidesContent.length} slides
              </span>
              {viewMode === 'present' && (
                <span className="text-xs font-medium text-violet-600">
                  {currentSlide + 1} / {slidesContent.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${viewMode === 'present' ? 'bg-violet-100 text-violet-600' : ''}`}
                onClick={() => setViewMode(viewMode === 'scroll' ? 'present' : 'scroll')}
                title="Toggle View Mode"
              >
                <Presentation className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${showNotes ? 'bg-amber-100 text-amber-600' : ''}`}
                onClick={() => setShowNotes(!showNotes)}
                title="Speaker Notes"
              >
                <FileText className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleFullscreen} title="Fullscreen">
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRegenerate} title="Regenerate">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Content Area */}
          {viewMode === 'scroll' ? (
            // Scroll Mode
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {slidesContent.map((slide, index) => (
                <SlideCard
                  key={index}
                  slide={slide}
                  showNotes={showNotes}
                  isFullscreen={false}
                />
              ))}
            </div>
          ) : (
            // Present Mode
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex items-center justify-center p-4">
                <SlideCard
                  slide={slidesContent[currentSlide]}
                  showNotes={showNotes}
                  isFullscreen={isFullscreen}
                  isPresenting
                />
              </div>
              {/* Navigation */}
              <div className="flex items-center justify-center gap-4 py-3 border-t border-border/30">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentSlide(prev => Math.max(prev - 1, 0))}
                  disabled={currentSlide === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex gap-1">
                  {slidesContent.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === currentSlide
                          ? 'bg-violet-500 w-4'
                          : 'bg-slate-300 hover:bg-slate-400'
                      }`}
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentSlide(prev => Math.min(prev + 1, slidesContent.length - 1))}
                  disabled={currentSlide === slidesContent.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : !isGeneratingSlides && !error && (
        <LoginGate feature="Slides">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center">
                <Presentation className="w-8 h-8 text-violet-500/70" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">Generate beautiful slides from video</p>
              <Button
                size="sm"
                onClick={generateSlidesContent}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Slides
              </Button>
            </div>
          </div>
        </LoginGate>
      )}
    </div>
  );
}

// Slide Card Component
function SlideCard({
  slide,
  showNotes,
  isFullscreen,
  isPresenting = false
}: {
  slide: Slide;
  showNotes: boolean;
  isFullscreen: boolean;
  isPresenting?: boolean;
}) {
  const cardClass = isPresenting
    ? 'w-full max-w-3xl'
    : '';

  return (
    <div className={cardClass}>
      {/* Slide Content */}
      <div className={`rounded-lg overflow-hidden ${
        isFullscreen
          ? 'bg-slate-900 border border-slate-800'
          : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm'
      }`}>
        {/* Slide Body */}
        <div className={`p-3 ${isPresenting ? 'min-h-[300px] flex items-center justify-center' : ''}`}>
          <SlideRenderer slide={slide} isFullscreen={isFullscreen} />
        </div>
      </div>

      {/* Speaker Notes */}
      {showNotes && slide.notes && (
        <div className={`mt-1.5 rounded-md p-2 ${
          isFullscreen
            ? 'bg-amber-500/10 border border-amber-500/20'
            : 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20'
        }`}>
          <div className="flex items-center gap-1 mb-1">
            <FileText className="w-2.5 h-2.5 text-amber-600" />
            <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-500 uppercase tracking-wide">Notes</span>
          </div>
          <p className={`text-[10px] leading-relaxed ${
            isFullscreen ? 'text-amber-200/80' : 'text-amber-800 dark:text-amber-200/80'
          }`}>
            {slide.notes}
          </p>
        </div>
      )}
    </div>
  );
}

// Slide Renderer Component
function SlideRenderer({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  if (slide.slide_type === 'title') {
    return <TitleSlide slide={slide} isFullscreen={isFullscreen} />;
  }

  if (slide.slide_type === 'summary') {
    return <SummarySlide slide={slide} isFullscreen={isFullscreen} />;
  }

  return <ContentSlide slide={slide} isFullscreen={isFullscreen} />;
}

// Title Slide
function TitleSlide({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  return (
    <div className="text-center py-2">
      <h1 className={`font-bold mb-1 text-slate-800 dark:text-slate-100 leading-tight ${
        isFullscreen ? 'text-2xl' : 'text-sm'
      }`}>
        {slide.title}
      </h1>

      {slide.subtitle && (
        <p className={`text-slate-500 dark:text-slate-400 ${
          isFullscreen ? 'text-base' : 'text-[10px]'
        }`}>
          {slide.subtitle}
        </p>
      )}
    </div>
  );
}


// Summary Slide
function SummarySlide({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  return (
    <div className="py-1">
      <h2 className={`font-bold mb-2 ${
        isFullscreen
          ? 'text-xl text-slate-100'
          : 'text-xs text-slate-800 dark:text-slate-100'
      }`}>
        {slide.title}
      </h2>

      <ul className="space-y-1">
        {slide.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`flex-shrink-0 mt-0.5 font-medium ${
              isFullscreen
                ? 'text-sm text-slate-400'
                : 'text-[10px] text-slate-400'
            }`}>
              {i + 1}.
            </span>
            <span className={`leading-snug ${
              isFullscreen
                ? 'text-base text-slate-200'
                : 'text-[11px] text-slate-700 dark:text-slate-300'
            }`}>
              {bullet}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Content Slide
function ContentSlide({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  return (
    <div className="py-1">
      <h2 className={`font-bold mb-2 ${
        isFullscreen
          ? 'text-xl text-slate-100'
          : 'text-xs text-slate-800 dark:text-slate-100'
      }`}>
        {slide.title}
      </h2>

      {slide.subtitle && (
        <p className={`mb-2 ${
          isFullscreen
            ? 'text-sm text-slate-400'
            : 'text-[10px] text-slate-500 dark:text-slate-400'
        }`}>
          {slide.subtitle}
        </p>
      )}

      <ul className="space-y-1">
        {slide.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`flex-shrink-0 mt-1 rounded-full ${
              isFullscreen
                ? 'w-1.5 h-1.5 bg-slate-400'
                : 'w-1 h-1 bg-slate-400'
            }`} />
            <span className={`leading-snug ${
              isFullscreen
                ? 'text-base text-slate-200'
                : 'text-[11px] text-slate-700 dark:text-slate-300'
            }`}>
              {bullet}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
