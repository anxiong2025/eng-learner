import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Brain,
  Loader2,
  Check,
  Circle,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import * as d3 from 'd3';
import { useVideoStore } from '@/stores/videoStore';
import { generateMindMap } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface GenerationStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

const GENERATION_STEPS: GenerationStep[] = [
  { id: 'collect', label: 'Collecting subtitles', status: 'pending' },
  { id: 'analyze', label: 'AI analyzing topics', status: 'pending' },
  { id: 'structure', label: 'Extracting key points', status: 'pending' },
  { id: 'organize', label: 'Organizing structure', status: 'pending' },
  { id: 'render', label: 'Rendering mind map', status: 'pending' },
];

export function MindMap() {
  const { subtitlesEn, videoInfo, translations } = useVideoStore();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<GenerationStep[]>(GENERATION_STEPS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);

  const updateStep = (stepId: string, status: GenerationStep['status']) => {
    setSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, status } : s
    ));
  };

  const resetSteps = () => {
    setSteps(GENERATION_STEPS.map(s => ({ ...s, status: 'pending' })));
  };

  const generateMap = useCallback(async () => {
    if (!videoInfo || subtitlesEn.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setMarkdownContent(null);
    resetSteps();

    try {
      // Step 1: Collect subtitles
      updateStep('collect', 'running');
      await new Promise(r => setTimeout(r, 300));

      // Combine English subtitles with translations
      const content = subtitlesEn.map((sub, i) => {
        const translation = translations.get(i);
        return translation ? `${sub.text} (${translation})` : sub.text;
      }).join('\n');

      updateStep('collect', 'done');

      // Step 2: AI analyze
      updateStep('analyze', 'running');

      // Call the API
      const result = await generateMindMap(
        videoInfo.video_id,
        videoInfo.title,
        content
      );

      updateStep('analyze', 'done');

      // Step 3: Extract key points
      updateStep('structure', 'running');
      await new Promise(r => setTimeout(r, 200));
      updateStep('structure', 'done');

      // Step 4: Organize structure
      updateStep('organize', 'running');
      await new Promise(r => setTimeout(r, 200));
      updateStep('organize', 'done');

      // Step 5: Render
      updateStep('render', 'running');
      setMarkdownContent(result.markdown);
      await new Promise(r => setTimeout(r, 300));
      updateStep('render', 'done');

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate mind map');
      resetSteps();
    } finally {
      setIsGenerating(false);
    }
  }, [videoInfo, subtitlesEn, translations]);

  // Render markmap when content is ready
  useEffect(() => {
    if (markdownContent && svgRef.current) {
      // Clear previous
      svgRef.current.innerHTML = '';

      const transformer = new Transformer();
      const { root } = transformer.transform(markdownContent);

      markmapRef.current = Markmap.create(svgRef.current, {
        autoFit: true,
        color: (node) => {
          const depth = node.state?.depth || 0;
          const colors = [
            '#3b82f6', // blue-500
            '#8b5cf6', // violet-500
            '#ec4899', // pink-500
            '#f59e0b', // amber-500
            '#10b981', // emerald-500
          ];
          return colors[depth % colors.length];
        },
        paddingX: 16,
        duration: 500,
      }, root);
    }
  }, [markdownContent]);

  // Auto-generate when dialog opens
  useEffect(() => {
    if (open && !markdownContent && !isGenerating) {
      generateMap();
    }
  }, [open, markdownContent, isGenerating, generateMap]);

  const handleZoomIn = () => {
    markmapRef.current?.rescale(1.25);
  };

  const handleZoomOut = () => {
    markmapRef.current?.rescale(0.8);
  };

  const handleReset = () => {
    markmapRef.current?.fit();
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!markmapRef.current || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const mm = markmapRef.current;

    // Mouse position relative to SVG
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;

    // Use d3 zoom to scale at mouse position
    const svgSelection = d3.select(svg);
    const currentTransform = d3.zoomTransform(svg);
    const newTransform = currentTransform
      .translate(x, y)
      .scale(scaleFactor)
      .translate(-x, -y);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svgSelection.call((mm as any).zoom.transform, newTransform);
  }, []);

  const handleDownload = () => {
    if (!svgRef.current) return;

    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `mindmap-${videoInfo?.title || 'video'}.svg`;
    link.click();

    URL.revokeObjectURL(url);
  };

  const handleRegenerate = () => {
    setMarkdownContent(null);
    generateMap();
  };

  if (!videoInfo) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          title="Generate Mind Map"
        >
          <Brain className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Map</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-500" />
            Video Mind Map
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Progress Steps */}
          {isGenerating && (
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="flex items-center gap-4 overflow-x-auto">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-2 shrink-0">
                    {step.status === 'done' ? (
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    ) : step.status === 'running' ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground/40" />
                    )}
                    <span className={`text-sm whitespace-nowrap ${
                      step.status === 'running' ? 'text-primary font-medium' :
                      step.status === 'done' ? 'text-green-600' :
                      'text-muted-foreground'
                    }`}>
                      {step.label}
                    </span>
                    {index < steps.length - 1 && (
                      <div className={`w-8 h-0.5 ${
                        step.status === 'done' ? 'bg-green-500' : 'bg-muted'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="px-6 py-4 bg-destructive/10 text-destructive text-sm">
              {error}
              <Button
                variant="link"
                size="sm"
                className="ml-2 text-destructive"
                onClick={handleRegenerate}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Mind Map Container */}
          <div className="flex-1 relative bg-gradient-to-br from-slate-50 to-slate-100">
            {markdownContent ? (
              <>
                <svg
                  ref={svgRef}
                  className="w-full h-full"
                  style={{ minHeight: '400px' }}
                  onWheel={handleWheel}
                />

                {/* Toolbar */}
                <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/90 backdrop-blur rounded-lg shadow-lg p-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset}>
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRegenerate}>
                    <Brain className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : !isGenerating && !error && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Brain className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Click to generate mind map</p>
                  <Button className="mt-4" onClick={generateMap}>
                    <Brain className="w-4 h-4 mr-2" />
                    Generate
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
