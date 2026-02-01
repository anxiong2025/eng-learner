import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Presentation,
  Loader2,
  Check,
  Circle,
  Maximize2,
  Minimize2,
  FileText,
  Download,
  RefreshCw,
  Quote,
  Sparkles,
  Target,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
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

  const generateSlidesContent = useCallback(async () => {
    if (!videoInfo || subtitlesEn.length === 0) return;

    setIsGeneratingSlides(true);
    setError(null);
    setSlidesContent(null);
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
      const result = await generateSlides(videoInfo.title, content);
      updateStep('design', 'done');

      updateStep('generate', 'running');
      await new Promise(r => setTimeout(r, 200));
      updateStep('generate', 'done');

      updateStep('render', 'running');
      setSlidesContent(result.slides);
      await new Promise(r => setTimeout(r, 300));
      updateStep('render', 'done');

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
    setSlidesContent(null);
    generateSlidesContent();
  };

  const exportToHTML = () => {
    if (!slidesContent) return;

    const html = generateExportHTML(slidesContent, videoInfo?.title || 'Slides');
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `slides-${videoInfo?.title || 'presentation'}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={exportToHTML} title="Export HTML">
                <Download className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRegenerate} title="Regenerate">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Content Area */}
          {viewMode === 'scroll' ? (
            // Scroll Mode
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {slidesContent.map((slide, index) => (
                <SlideCard
                  key={index}
                  slide={slide}
                  index={index}
                  total={slidesContent.length}
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
                  index={currentSlide}
                  total={slidesContent.length}
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
  index,
  total,
  showNotes,
  isFullscreen,
  isPresenting = false
}: {
  slide: Slide;
  index: number;
  total: number;
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
      <div className={`rounded-xl overflow-hidden ${
        isFullscreen
          ? 'bg-slate-900 border border-slate-800'
          : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm'
      }`}>
        {/* Slide Header */}
        <div className={`px-4 py-2 flex items-center justify-between border-b ${
          isFullscreen
            ? 'border-slate-800 bg-slate-900/50'
            : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50'
        }`}>
          <span className={`text-[10px] font-medium ${
            isFullscreen ? 'text-slate-500' : 'text-slate-400'
          }`}>
            {index + 1} / {total}
          </span>
          <SlideTypeTag type={slide.slide_type} />
        </div>

        {/* Slide Body */}
        <div className={`p-5 ${isPresenting ? 'min-h-[300px] flex items-center justify-center' : ''}`}>
          <SlideRenderer slide={slide} isFullscreen={isFullscreen} />
        </div>
      </div>

      {/* Speaker Notes */}
      {showNotes && slide.notes && (
        <div className={`mt-2 rounded-lg p-3 ${
          isFullscreen
            ? 'bg-amber-500/10 border border-amber-500/20'
            : 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20'
        }`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText className="w-3 h-3 text-amber-600" />
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-500 uppercase tracking-wide">Notes</span>
          </div>
          <p className={`text-xs leading-relaxed ${
            isFullscreen ? 'text-amber-200/80' : 'text-amber-800 dark:text-amber-200/80'
          }`}>
            {slide.notes}
          </p>
        </div>
      )}
    </div>
  );
}

// Slide Type Tag
function SlideTypeTag({ type }: { type: Slide['slide_type'] }) {
  const config = {
    title: { label: 'Title', color: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400' },
    content: { label: 'Content', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
    quote: { label: 'Quote', color: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' },
    summary: { label: 'Summary', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
  };

  const { label, color } = config[type] || config.content;

  return (
    <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  );
}

// Slide Renderer Component
function SlideRenderer({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  if (slide.slide_type === 'title') {
    return <TitleSlide slide={slide} isFullscreen={isFullscreen} />;
  }

  if (slide.slide_type === 'quote') {
    return <QuoteSlide slide={slide} isFullscreen={isFullscreen} />;
  }

  if (slide.slide_type === 'summary') {
    return <SummarySlide slide={slide} isFullscreen={isFullscreen} />;
  }

  return <ContentSlide slide={slide} isFullscreen={isFullscreen} />;
}

// Title Slide
function TitleSlide({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  return (
    <div className="text-center py-6 relative">
      {/* Decorative elements */}
      <div className="absolute inset-0 flex items-center justify-center opacity-5">
        <div className="w-64 h-64 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-0.5 bg-gradient-to-r from-transparent to-violet-400" />
          <Sparkles className={`${isFullscreen ? 'w-5 h-5' : 'w-4 h-4'} text-violet-500`} />
          <div className="w-8 h-0.5 bg-gradient-to-l from-transparent to-violet-400" />
        </div>

        <h1 className={`font-bold mb-3 bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent leading-tight ${
          isFullscreen ? 'text-4xl' : 'text-xl'
        }`}>
          {slide.title}
        </h1>

        {slide.subtitle && (
          <p className={`text-slate-500 dark:text-slate-400 font-medium ${
            isFullscreen ? 'text-lg' : 'text-sm'
          }`}>
            {slide.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// Quote Slide
function QuoteSlide({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  return (
    <div className="py-4 relative">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 opacity-10">
        <Quote className={`${isFullscreen ? 'w-24 h-24' : 'w-16 h-16'} text-rose-500 -rotate-12`} />
      </div>

      <div className="relative text-center px-4">
        <blockquote className={`italic font-serif leading-relaxed mb-4 ${
          isFullscreen
            ? 'text-2xl text-slate-200'
            : 'text-lg text-slate-700 dark:text-slate-200'
        }`}>
          "{slide.quote}"
        </blockquote>

        <div className="flex items-center justify-center gap-2">
          <div className="w-6 h-0.5 bg-rose-300" />
          <p className={`font-medium text-rose-600 dark:text-rose-400 ${
            isFullscreen ? 'text-base' : 'text-sm'
          }`}>
            {slide.title}
          </p>
          <div className="w-6 h-0.5 bg-rose-300" />
        </div>
      </div>
    </div>
  );
}

// Summary Slide
function SummarySlide({ slide, isFullscreen }: { slide: Slide; isFullscreen: boolean }) {
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm shadow-emerald-500/30">
          <Target className={`${isFullscreen ? 'w-5 h-5' : 'w-4 h-4'} text-white`} />
        </div>
        <h2 className={`font-bold ${
          isFullscreen
            ? 'text-2xl text-emerald-400'
            : 'text-lg text-emerald-600 dark:text-emerald-400'
        }`}>
          {slide.title}
        </h2>
      </div>

      <ul className="space-y-3">
        {slide.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-3 group">
            <span className={`flex-shrink-0 flex items-center justify-center rounded-lg font-bold shadow-sm ${
              isFullscreen
                ? 'w-7 h-7 text-sm bg-gradient-to-br from-emerald-500 to-teal-500 text-white'
                : 'w-6 h-6 text-xs bg-gradient-to-br from-emerald-500 to-teal-500 text-white'
            }`}>
              {i + 1}
            </span>
            <span className={`pt-0.5 leading-relaxed ${
              isFullscreen
                ? 'text-lg text-slate-200'
                : 'text-sm text-slate-700 dark:text-slate-300'
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
    <div className="py-2">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-sm shadow-blue-500/30">
          <Lightbulb className={`${isFullscreen ? 'w-5 h-5' : 'w-4 h-4'} text-white`} />
        </div>
        <h2 className={`font-bold ${
          isFullscreen
            ? 'text-2xl text-slate-100'
            : 'text-lg text-slate-800 dark:text-slate-100'
        }`}>
          {slide.title}
        </h2>
      </div>

      {slide.subtitle && (
        <p className={`mb-4 ${
          isFullscreen
            ? 'text-base text-slate-400'
            : 'text-sm text-slate-500 dark:text-slate-400'
        }`}>
          {slide.subtitle}
        </p>
      )}

      <ul className="space-y-2.5">
        {slide.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`flex-shrink-0 mt-1.5 rounded-full ${
              isFullscreen
                ? 'w-2 h-2 bg-gradient-to-r from-blue-400 to-cyan-400'
                : 'w-1.5 h-1.5 bg-gradient-to-r from-blue-500 to-cyan-500'
            }`} />
            <span className={`leading-relaxed ${
              isFullscreen
                ? 'text-lg text-slate-200'
                : 'text-sm text-slate-700 dark:text-slate-300'
            }`}>
              {bullet}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Generate exportable HTML with premium design
function generateExportHTML(slides: Slide[], title: string): string {
  const slideHTML = slides.map((slide, idx) => {
    if (slide.slide_type === 'title') {
      return `
        <section class="slide title-slide" data-index="${idx}">
          <div class="slide-inner">
            <div class="decorative-line"></div>
            <h1>${slide.title}</h1>
            ${slide.subtitle ? `<p class="subtitle">${slide.subtitle}</p>` : ''}
          </div>
        </section>
      `;
    }
    if (slide.slide_type === 'quote') {
      return `
        <section class="slide quote-slide" data-index="${idx}">
          <div class="slide-inner">
            <div class="quote-mark">"</div>
            <blockquote>${slide.quote}</blockquote>
            <p class="attribution">— ${slide.title}</p>
          </div>
        </section>
      `;
    }
    if (slide.slide_type === 'summary') {
      return `
        <section class="slide summary-slide" data-index="${idx}">
          <div class="slide-inner">
            <h2><span class="icon">✓</span> ${slide.title}</h2>
            <ol>
              ${slide.bullets.map(b => `<li>${b}</li>`).join('\n              ')}
            </ol>
          </div>
        </section>
      `;
    }
    return `
      <section class="slide content-slide" data-index="${idx}">
        <div class="slide-inner">
          <h2><span class="icon">💡</span> ${slide.title}</h2>
          ${slide.subtitle ? `<p class="subtitle">${slide.subtitle}</p>` : ''}
          <ul>
            ${slide.bullets.map(b => `<li>${b}</li>`).join('\n            ')}
          </ul>
        </div>
      </section>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #0f172a, #1e293b);
      min-height: 100vh;
    }
    .slides-container { width: 100vw; height: 100vh; overflow: hidden; position: relative; }
    .slide {
      width: 100vw;
      height: 100vh;
      display: none;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 0;
      left: 0;
    }
    .slide.active { display: flex; }
    .slide-inner {
      max-width: 900px;
      width: 90%;
      padding: 3rem;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 1.5rem;
      backdrop-filter: blur(20px);
    }

    /* Title Slide */
    .title-slide .decorative-line {
      width: 60px;
      height: 4px;
      background: linear-gradient(90deg, #8b5cf6, #6366f1);
      border-radius: 2px;
      margin: 0 auto 2rem;
    }
    .title-slide h1 {
      font-size: 3rem;
      font-weight: 700;
      background: linear-gradient(135deg, #c4b5fd, #818cf8, #c4b5fd);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-align: center;
      line-height: 1.2;
    }
    .title-slide .subtitle {
      font-size: 1.25rem;
      color: #94a3b8;
      text-align: center;
      margin-top: 1rem;
    }

    /* Content Slide */
    .content-slide h2, .summary-slide h2 {
      font-size: 1.75rem;
      color: #f1f5f9;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .content-slide .icon, .summary-slide .icon {
      font-size: 1.25rem;
    }
    .content-slide .subtitle {
      color: #94a3b8;
      margin-bottom: 1.5rem;
      font-size: 1rem;
    }
    .content-slide ul { list-style: none; }
    .content-slide li {
      margin-bottom: 1rem;
      padding-left: 1.5rem;
      position: relative;
      color: #e2e8f0;
      font-size: 1.125rem;
      line-height: 1.6;
    }
    .content-slide li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.6rem;
      width: 6px;
      height: 6px;
      background: linear-gradient(135deg, #3b82f6, #06b6d4);
      border-radius: 50%;
    }

    /* Summary Slide */
    .summary-slide ol {
      list-style: none;
      counter-reset: item;
    }
    .summary-slide li {
      margin-bottom: 1rem;
      padding-left: 2.5rem;
      position: relative;
      color: #e2e8f0;
      font-size: 1.125rem;
      line-height: 1.6;
      counter-increment: item;
    }
    .summary-slide li::before {
      content: counter(item);
      position: absolute;
      left: 0;
      top: 0;
      width: 1.75rem;
      height: 1.75rem;
      background: linear-gradient(135deg, #10b981, #14b8a6);
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.875rem;
      color: white;
    }

    /* Quote Slide */
    .quote-slide .slide-inner {
      text-align: center;
      position: relative;
    }
    .quote-slide .quote-mark {
      font-size: 8rem;
      color: rgba(244, 63, 94, 0.2);
      position: absolute;
      top: -2rem;
      left: 2rem;
      font-family: Georgia, serif;
      line-height: 1;
    }
    .quote-slide blockquote {
      font-size: 1.75rem;
      font-style: italic;
      color: #f1f5f9;
      line-height: 1.6;
      position: relative;
      z-index: 1;
    }
    .quote-slide .attribution {
      font-size: 1rem;
      color: #f43f5e;
      margin-top: 1.5rem;
      font-weight: 500;
    }

    /* Navigation */
    .nav-bar {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 1rem;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(10px);
      padding: 0.75rem 1.5rem;
      border-radius: 9999px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .nav-dots {
      display: flex;
      gap: 0.5rem;
    }
    .nav-dot {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      background: rgba(255,255,255,0.3);
      cursor: pointer;
      transition: all 0.2s;
    }
    .nav-dot.active {
      background: #8b5cf6;
      width: 24px;
    }
    .nav-hint {
      color: #64748b;
      font-size: 0.75rem;
    }
  </style>
</head>
<body>
  <div class="slides-container">
    ${slideHTML}
  </div>
  <div class="nav-bar">
    <div class="nav-dots" id="navDots"></div>
    <span class="nav-hint">← → to navigate</span>
  </div>
  <script>
    const slides = document.querySelectorAll('.slide');
    const navDots = document.getElementById('navDots');
    let current = 0;

    // Create dots
    slides.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'nav-dot' + (i === 0 ? ' active' : '');
      dot.onclick = () => goTo(i);
      navDots.appendChild(dot);
    });

    function goTo(index) {
      slides[current].classList.remove('active');
      navDots.children[current].classList.remove('active');
      current = index;
      slides[current].classList.add('active');
      navDots.children[current].classList.add('active');
    }

    slides[0].classList.add('active');

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        goTo(Math.min(current + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft') {
        goTo(Math.max(current - 1, 0));
      }
    });
  </script>
</body>
</html>`;
}
