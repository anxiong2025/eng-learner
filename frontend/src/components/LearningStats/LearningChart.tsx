import { useMemo, useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getVocabularyList, type DailyStats, type SavedVocabulary } from '@/api/client';
import { Loader2 } from 'lucide-react';

interface LearningChartProps {
  stats: DailyStats[];
  averageRetention: number; // 0-100, user's current average memory strength
}

export function LearningChart({ stats }: LearningChartProps) {
  const [view, setView] = useState<'progress' | 'forgetting'>('progress');

  return (
    <div className="space-y-4">
      <Tabs value={view} onValueChange={(v) => setView(v as 'progress' | 'forgetting')}>
        <TabsList className="grid w-full max-w-[240px] grid-cols-2 h-8">
          <TabsTrigger value="progress" className="text-xs h-7">Progress</TabsTrigger>
          <TabsTrigger value="forgetting" className="text-xs h-7">Memory Curve</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'progress' ? (
        <ProgressChart stats={stats} />
      ) : (
        <InteractiveForgettingCurve />
      )}
    </div>
  );
}

// Learning Progress Line Chart
function ProgressChart({ stats }: { stats: DailyStats[] }) {
  const chartData = useMemo(() => {
    // Get last 30 days
    const last30 = stats.slice(0, 30).reverse();

    if (last30.length === 0) {
      return { data: [], maxValue: 10 };
    }

    const data = last30.map(s => ({
      date: s.date,
      learned: s.words_learned,
      reviewed: s.words_reviewed,
    }));

    const maxValue = Math.max(
      10,
      ...data.map(d => Math.max(d.learned, d.reviewed))
    );

    return { data, maxValue };
  }, [stats]);

  const { data, maxValue } = chartData;
  const chartHeight = 120;

  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
        No learning data yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Chart */}
      <div className="relative h-32">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-4 w-6 flex flex-col justify-between text-[10px] text-muted-foreground">
          <span>{maxValue}</span>
          <span>{Math.round(maxValue / 2)}</span>
          <span>0</span>
        </div>

        {/* Chart area */}
        <div className="ml-7 h-full pr-1">
          <svg
            viewBox={`0 0 ${data.length * 10} ${chartHeight}`}
            className="w-full h-28"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            <line x1="0" y1={chartHeight / 2} x2={data.length * 10} y2={chartHeight / 2} stroke="#e5e7eb" strokeWidth="1" />

            {/* Learned line (blue) */}
            <polyline
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={data.map((d, i) =>
                `${i * 10 + 5},${chartHeight - (d.learned / maxValue) * chartHeight}`
              ).join(' ')}
            />

            {/* Reviewed line (purple) */}
            <polyline
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 2"
              points={data.map((d, i) =>
                `${i * 10 + 5},${chartHeight - (d.reviewed / maxValue) * chartHeight}`
              ).join(' ')}
            />

            {/* Dots for learned */}
            {data.map((d, i) => (
              <circle
                key={i}
                cx={i * 10 + 5}
                cy={chartHeight - (d.learned / maxValue) * chartHeight}
                r="3"
                fill="#3b82f6"
              />
            ))}
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{data[0]?.date.slice(5)}</span>
            <span>{data[data.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-blue-500 rounded" />
          <span className="text-muted-foreground">Learned</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-purple-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #8b5cf6 0, #8b5cf6 4px, transparent 4px, transparent 6px)' }} />
          <span className="text-muted-foreground">Reviewed</span>
        </div>
      </div>
    </div>
  );
}

// Interactive Forgetting Curve with real vocabulary data
function InteractiveForgettingCurve() {
  const [vocabulary, setVocabulary] = useState<SavedVocabulary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  useEffect(() => {
    const fetchVocabulary = async () => {
      try {
        const data = await getVocabularyList(false);
        setVocabulary(data.vocabulary);
      } catch (error) {
        console.error('Failed to fetch vocabulary:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchVocabulary();
  }, []);

  // Calculate predicted memory for each word over 30 days
  const predictions = useMemo(() => {
    if (vocabulary.length === 0) return null;

    const days = 30;
    const dailyData: { day: number; avgRetention: number; forgottenCount: number; criticalWords: string[] }[] = [];

    for (let day = 0; day <= days; day++) {
      let totalRetention = 0;
      let forgottenCount = 0;
      const criticalWords: string[] = [];

      vocabulary.forEach(vocab => {
        // Calculate days since last review
        const lastReviewed = vocab.last_reviewed_at ? new Date(vocab.last_reviewed_at) : new Date(vocab.created_at);
        const daysSinceReview = (Date.now() - lastReviewed.getTime()) / (1000 * 60 * 60 * 24) + day;

        // Stability based on interval (higher interval = more stable memory)
        const stability = Math.max(1, vocab.interval_days * 0.7);

        // Forgetting curve: R = e^(-t/S)
        const retention = Math.exp(-daysSinceReview / stability) * 100;

        totalRetention += retention;

        if (retention < 30) {
          forgottenCount++;
          if (criticalWords.length < 5) {
            criticalWords.push(vocab.word);
          }
        }
      });

      dailyData.push({
        day,
        avgRetention: totalRetention / vocabulary.length,
        forgottenCount,
        criticalWords,
      });
    }

    return dailyData;
  }, [vocabulary]);

  const chartHeight = 120;
  const chartWidth = 280;

  if (isLoading) {
    return (
      <div className="h-36 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!predictions || vocabulary.length === 0) {
    return (
      <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">
        Add words to see memory predictions
      </div>
    );
  }

  // Generate curve points
  const curvePoints = predictions.map((p, i) => ({
    x: (i / 30) * chartWidth,
    y: chartHeight - (p.avgRetention / 100) * chartHeight,
  }));

  const hoveredData = hoveredDay !== null ? predictions[hoveredDay] : null;

  return (
    <div className="space-y-2">
      {/* Chart */}
      <div className="relative h-36">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-4 w-8 flex flex-col justify-between text-[10px] text-muted-foreground">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>

        {/* Chart area */}
        <div className="ml-9 h-full">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-32"
            preserveAspectRatio="xMidYMid meet"
            onMouseLeave={() => setHoveredDay(null)}
          >
            {/* Grid lines */}
            <line x1="0" y1={chartHeight / 2} x2={chartWidth} y2={chartHeight / 2} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />

            {/* Danger zone (below 30%) */}
            <rect
              x="0"
              y={chartHeight - (30 / 100) * chartHeight}
              width={chartWidth}
              height={(30 / 100) * chartHeight}
              fill="#fef2f2"
              opacity="0.5"
            />

            {/* Memory curve */}
            <path
              d={`M ${curvePoints.map(p => `${p.x},${p.y}`).join(' L ')}`}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
            />

            {/* Fill under curve */}
            <path
              d={`M 0,${chartHeight} L ${curvePoints.map(p => `${p.x},${p.y}`).join(' L ')} L ${chartWidth},${chartHeight} Z`}
              fill="url(#gradient)"
              opacity="0.3"
            />

            {/* Gradient definition */}
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Hover areas */}
            {predictions.map((_, i) => (
              <rect
                key={i}
                x={(i / 30) * chartWidth - 4}
                y="0"
                width={(1 / 30) * chartWidth + 8}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredDay(i)}
                className="cursor-crosshair"
              />
            ))}

            {/* Hover indicator */}
            {hoveredDay !== null && (
              <>
                <line
                  x1={(hoveredDay / 30) * chartWidth}
                  y1="0"
                  x2={(hoveredDay / 30) * chartWidth}
                  y2={chartHeight}
                  stroke="#3b82f6"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={(hoveredDay / 30) * chartWidth}
                  cy={curvePoints[hoveredDay].y}
                  r="5"
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth="2"
                />
              </>
            )}
          </svg>

          {/* X-axis label */}
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>Today</span>
            <span>Day 30</span>
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredData ? (
        <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-xs animate-in fade-in duration-150">
          <div className="flex justify-between items-center">
            <span className="font-medium">Day {hoveredData.day}</span>
            <span className={`font-semibold ${
              hoveredData.avgRetention >= 70 ? 'text-green-600' :
              hoveredData.avgRetention >= 40 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {Math.round(hoveredData.avgRetention)}% retention
            </span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Likely forgotten:</span>
            <span className={hoveredData.forgottenCount > 0 ? 'text-red-500 font-medium' : ''}>
              {hoveredData.forgottenCount} words
            </span>
          </div>
          {hoveredData.criticalWords.length > 0 && (
            <div className="pt-1 border-t">
              <span className="text-muted-foreground">At risk: </span>
              <span className="text-red-500">{hoveredData.criticalWords.join(', ')}</span>
              {hoveredData.forgottenCount > 5 && <span className="text-muted-foreground">...</span>}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-center text-muted-foreground py-2">
          Hover over the curve to see predictions
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 text-xs pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-blue-500 rounded" />
          <span className="text-muted-foreground">Your Memory</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-red-50 border border-red-200 rounded" />
          <span className="text-muted-foreground">Danger Zone</span>
        </div>
      </div>
    </div>
  );
}
