import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Brain, Target, TrendingUp, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getLearningOverview,
  getDailyStats,
  getMemoryDistribution,
  type LearningOverview,
  type DailyStats,
  type MemoryDistribution
} from '@/api/client';
import { ContributionGraph } from './ContributionGraph';
import { LearningChart } from './LearningChart';

// No props needed - navigation handled by MainLayout

// Memory distribution bar component
function MemoryBar({ distribution }: { distribution: MemoryDistribution }) {
  const total = distribution.total || 1;
  const segments = [
    { count: distribution.strong, color: 'bg-green-500', label: 'Strong' },
    { count: distribution.good, color: 'bg-yellow-500', label: 'Good' },
    { count: distribution.weak, color: 'bg-orange-500', label: 'Weak' },
    { count: distribution.critical, color: 'bg-red-500', label: 'Critical' },
  ];

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden bg-muted flex">
        {segments.map((seg, i) => (
          seg.count > 0 && (
            <div
              key={i}
              className={`${seg.color} transition-all`}
              style={{ width: `${(seg.count / total) * 100}%` }}
            />
          )
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${seg.color}`} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-medium">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Accuracy trend mini chart
function AccuracyTrend({ stats }: { stats: DailyStats[] }) {
  const weeklyAccuracy = useMemo(() => {
    // Get last 7 days with activity
    const withReviews = stats
      .filter(s => s.words_reviewed > 0)
      .slice(0, 7)
      .reverse();

    return withReviews.map(s => ({
      date: s.date,
      accuracy: s.words_reviewed > 0
        ? Math.round((s.correct_count / s.words_reviewed) * 100)
        : 0,
    }));
  }, [stats]);

  const avgAccuracy = weeklyAccuracy.length > 0
    ? Math.round(weeklyAccuracy.reduce((sum, d) => sum + d.accuracy, 0) / weeklyAccuracy.length)
    : 0;

  const maxHeight = 40;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between h-12 gap-1">
        {weeklyAccuracy.length === 0 ? (
          <div className="flex-1 text-center text-xs text-muted-foreground py-4">
            No review data yet
          </div>
        ) : (
          weeklyAccuracy.map((day, i) => (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1"
              title={`${day.date}: ${day.accuracy}%`}
            >
              <div
                className={`w-full rounded-t ${
                  day.accuracy >= 80 ? 'bg-green-500' :
                  day.accuracy >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ height: `${(day.accuracy / 100) * maxHeight}px`, minHeight: day.accuracy > 0 ? '4px' : '0' }}
              />
            </div>
          ))
        )}
      </div>
      <div className="text-center">
        <span className="text-2xl font-bold">{avgAccuracy}%</span>
        <span className="text-xs text-muted-foreground ml-1">avg</span>
      </div>
    </div>
  );
}

// Calculate average retention from memory distribution
function calculateAverageRetention(dist: MemoryDistribution): number {
  if (dist.total === 0) return 0;
  // Weighted average: Strong=90%, Good=70%, Weak=50%, Critical=20%
  const weightedSum = dist.strong * 90 + dist.good * 70 + dist.weak * 50 + dist.critical * 20;
  return Math.round(weightedSum / dist.total);
}

// Today's progress card
function TodayCard({ today }: { today: DailyStats }) {
  const accuracy = today.words_reviewed > 0
    ? Math.round((today.correct_count / today.words_reviewed) * 100)
    : 0;

  return (
    <div className="grid grid-cols-3 gap-4 text-center">
      <div>
        <p className="text-2xl font-bold text-blue-600">{today.words_learned}</p>
        <p className="text-xs text-muted-foreground">New words</p>
      </div>
      <div>
        <p className="text-2xl font-bold text-purple-600">{today.words_reviewed}</p>
        <p className="text-xs text-muted-foreground">Reviewed</p>
      </div>
      <div>
        <p className="text-2xl font-bold text-green-600">{accuracy}%</p>
        <p className="text-xs text-muted-foreground">Accuracy</p>
      </div>
    </div>
  );
}

export function LearningStats() {
  const [overview, setOverview] = useState<LearningOverview | null>(null);
  const [yearlyStats, setYearlyStats] = useState<DailyStats[]>([]);
  const [memoryDist, setMemoryDist] = useState<MemoryDistribution | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [overviewData, yearlyData, memoryData] = await Promise.all([
        getLearningOverview(),
        getDailyStats(365),
        getMemoryDistribution(),
      ]);
      setOverview(overviewData);
      setYearlyStats(yearlyData);
      setMemoryDist(memoryData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load</p>
        <Button variant="outline" onClick={fetchData} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const { progress, today } = overview;

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-semibold">Dashboard</h1>
        <Button variant="ghost" size="sm" onClick={fetchData} className="h-10 w-10 p-0">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Top Stats Cards - 2x2 grid on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card>
          <CardContent className="pt-3 pb-2 sm:pt-4 sm:pb-3 text-center">
            <Brain className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-xl sm:text-2xl font-bold">{progress.total_words_learned}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Words</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 sm:pt-4 sm:pb-3 text-center">
            <Flame className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-orange-500" />
            <p className="text-xl sm:text-2xl font-bold">{progress.current_streak}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 sm:pt-4 sm:pb-3 text-center">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-purple-500" />
            <p className="text-xl sm:text-2xl font-bold">{progress.total_reviews}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 sm:pt-4 sm:pb-3 text-center">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-green-500" />
            <p className="text-xl sm:text-2xl font-bold">{progress.longest_streak}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Best</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid - Stack on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Today's Progress */}
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <TodayCard today={today} />
          </CardContent>
        </Card>

        {/* Weekly Accuracy */}
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6">
            <CardTitle className="text-sm font-medium">Weekly Accuracy</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <AccuracyTrend stats={yearlyStats} />
          </CardContent>
        </Card>
      </div>

      {/* Memory Distribution */}
      {memoryDist && memoryDist.total > 0 && (
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6">
            <CardTitle className="text-sm font-medium">Memory Status</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <MemoryBar distribution={memoryDist} />
          </CardContent>
        </Card>
      )}

      {/* Learning Progress & Forgetting Curve Chart */}
      <Card>
        <CardHeader className="pb-2 px-3 sm:px-6">
          <CardTitle className="text-sm font-medium">Learning Trends</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <LearningChart
            stats={yearlyStats}
            averageRetention={memoryDist ? calculateAverageRetention(memoryDist) : 50}
          />
        </CardContent>
      </Card>

      {/* Contribution Graph - Scrollable on mobile */}
      <Card>
        <CardHeader className="pb-2 px-3 sm:px-6">
          <CardTitle className="text-sm font-medium">Activity</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 overflow-x-auto">
          <ContributionGraph stats={yearlyStats} />
        </CardContent>
      </Card>
    </div>
  );
}
