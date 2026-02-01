import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Brain,
  Loader2,
  Check,
  Circle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
} from 'lucide-react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import * as d3 from 'd3';
import { useVideoStore } from '@/stores/videoStore';
import { generateMindMap } from '@/api/client';
import { Button } from '@/components/ui/button';
import { LoginGate } from '@/components/ProFeatureGate';

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

export function MindMapPanel() {
  const { subtitlesEn, videoInfo, translations, mindMapContent, setMindMapContent } = useVideoStore();
  const [steps, setSteps] = useState<GenerationStep[]>(GENERATION_STEPS);
  const [isGenerating, setIsGenerating] = useState(false);
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

  const generateMap = useCallback(async (forceRegenerate = false) => {
    if (!videoInfo || subtitlesEn.length === 0) return;

    setIsGenerating(true);
    setError(null);
    if (forceRegenerate) {
      setMindMapContent(null);
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

      const result = await generateMindMap(videoInfo.video_id, videoInfo.title, content, forceRegenerate);

      // If cached result returned quickly, skip animation
      if (result.cached) {
        setMindMapContent(result.markdown);
        setSteps(GENERATION_STEPS.map(s => ({ ...s, status: 'done' })));
      } else {
        updateStep('analyze', 'done');
        updateStep('structure', 'running');
        await new Promise(r => setTimeout(r, 200));
        updateStep('structure', 'done');

        updateStep('organize', 'running');
        await new Promise(r => setTimeout(r, 200));
        updateStep('organize', 'done');

        updateStep('render', 'running');
        setMindMapContent(result.markdown);
        await new Promise(r => setTimeout(r, 300));
        updateStep('render', 'done');
      }

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate mind map');
      resetSteps();
    } finally {
      setIsGenerating(false);
    }
  }, [videoInfo, subtitlesEn, translations, setMindMapContent]);

  useEffect(() => {
    if (mindMapContent && svgRef.current) {
      svgRef.current.innerHTML = '';

      const transformer = new Transformer();
      const { root } = transformer.transform(mindMapContent);

      markmapRef.current = Markmap.create(svgRef.current, {
        autoFit: true,
        color: (node) => {
          const depth = node.state?.depth || 0;
          const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
          return colors[depth % colors.length];
        },
        paddingX: 16,
        duration: 500,
      }, root);
    }
  }, [mindMapContent]);

  const handleZoomIn = () => markmapRef.current?.rescale(1.25);
  const handleZoomOut = () => markmapRef.current?.rescale(0.8);
  const handleReset = () => markmapRef.current?.fit();

  const handleDownload = () => {
    if (!svgRef.current || !videoInfo) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoInfo.title}-mindmap.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!markmapRef.current || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const mm = markmapRef.current;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;

    const svgSelection = d3.select(svg);
    const currentTransform = d3.zoomTransform(svg);
    const newScale = currentTransform.k * scaleFactor;
    const newX = mouseX - (mouseX - currentTransform.x) * scaleFactor;
    const newY = mouseY - (mouseY - currentTransform.y) * scaleFactor;
    const newTransform = d3.zoomIdentity.translate(newX, newY).scale(newScale);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svgSelection.call((mm as any).zoom.transform, newTransform);
  }, []);

  const handleRegenerate = () => {
    generateMap(true); // Force regenerate, skip cache
  };

  // Auto-load cached mind map on mount
  useEffect(() => {
    if (videoInfo && subtitlesEn.length > 0 && !mindMapContent && !isGenerating) {
      generateMap(false); // Try to load from cache
    }
  }, [videoInfo?.video_id]); // Only run when video changes

  if (!videoInfo) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Load a video to generate mind map</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Progress Steps */}
      {isGenerating && (
        <div className="py-4 border-b bg-muted/30">
          <div className="flex flex-col gap-2">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-2">
                {step.status === 'done' ? (
                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                ) : step.status === 'running' ? (
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/40" />
                )}
                <span className={`text-xs ${
                  step.status === 'running' ? 'text-primary font-medium' :
                  step.status === 'done' ? 'text-green-600' :
                  'text-muted-foreground'
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
        <div className="py-3 px-4 bg-destructive/10 text-destructive text-sm rounded-lg">
          {error}
          <Button variant="link" size="sm" className="ml-2 text-destructive" onClick={handleRegenerate}>
            Retry
          </Button>
        </div>
      )}

      {/* Mind Map Container */}
      <div className="flex-1 relative bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg overflow-hidden">
        {mindMapContent ? (
          <>
            <svg
              ref={svgRef}
              className="w-full h-full"
              style={{ minHeight: '300px' }}
              onWheel={handleWheel}
            />

            {/* Toolbar */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur rounded-lg shadow-lg p-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Download SVG">
                <Download className="w-3.5 h-3.5" />
              </Button>
              <div className="w-px h-5 bg-border" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRegenerate} title="Regenerate">
                <Brain className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        ) : !isGenerating && !error && (
          <LoginGate feature="Mind Map">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Brain className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mb-3">Generate a mind map from video content</p>
                <Button size="sm" onClick={generateMap}>
                  <Brain className="w-4 h-4 mr-2" />
                  Generate
                </Button>
              </div>
            </div>
          </LoginGate>
        )}
      </div>
    </div>
  );
}
