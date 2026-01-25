import { useState, useEffect } from 'react';
import {
  BarChart3,
  Target,
  Flame,
  Trophy,
  Calendar,
  TrendingUp,
  BookOpen,
  CheckCircle2,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getLearningOverview, type LearningOverview, type DailyStats } from '@/api/client';

interface LearningStatsProps {
  onBack: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

function getWeekday(dateStr: string): string {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

export function LearningStats({ onBack }: LearningStatsProps) {
  const [overview, setOverview] = useState<LearningOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOverview = async () => {
    setIsLoading(true);
    try {
      const data = await getLearningOverview();
      setOverview(data);
    } catch (error) {
      console.error('Failed to fetch overview:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  // Fill in missing days for the weekly chart
  const getFilledWeeklyStats = (): DailyStats[] => {
    if (!overview) return [];

    const result: DailyStats[] = [];
    const statsMap = new Map(overview.weekly_stats.map(s => [s.date, s]));

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      result.push(statsMap.get(dateStr) || {
        date: dateStr,
        words_learned: 0,
        words_reviewed: 0,
        correct_count: 0,
        incorrect_count: 0,
        study_time_minutes: 0,
      });
    }

    return result;
  };

  const weeklyStats = getFilledWeeklyStats();
  const maxActivity = Math.max(...weeklyStats.map(s => s.words_learned + s.words_reviewed), 1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">加载失败，请重试</p>
        <Button onClick={fetchOverview} className="mt-4">重新加载</Button>
      </div>
    );
  }

  const { today, progress, accuracy_rate } = overview;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              学习统计
            </h1>
            <p className="text-sm text-muted-foreground">
              记录你的学习进度
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOverview}>
          <RefreshCw className="w-4 h-4 mr-1" />
          刷新
        </Button>
      </div>

      {/* Today's Stats */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-blue-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            今日学习
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{today.words_learned}</p>
              <p className="text-sm text-muted-foreground">新学单词</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{today.words_reviewed}</p>
              <p className="text-sm text-muted-foreground">复习单词</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{today.correct_count}</p>
              <p className="text-sm text-muted-foreground">答对次数</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-500">{today.incorrect_count}</p>
              <p className="text-sm text-muted-foreground">答错次数</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{progress.total_words_learned}</p>
              <p className="text-xs text-muted-foreground">总学习单词</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{progress.total_reviews}</p>
              <p className="text-xs text-muted-foreground">总复习次数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Flame className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{progress.current_streak}</p>
              <p className="text-xs text-muted-foreground">连续学习天数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Trophy className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{progress.longest_streak}</p>
              <p className="text-xs text-muted-foreground">最长连续天数</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Activity Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            本周学习活动
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2 h-32">
            {weeklyStats.map((stat, index) => {
              const totalActivity = stat.words_learned + stat.words_reviewed;
              const height = (totalActivity / maxActivity) * 100;
              const isToday = index === weeklyStats.length - 1;

              return (
                <div key={stat.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-center justify-end h-24">
                    {totalActivity > 0 && (
                      <span className="text-xs text-muted-foreground mb-1">
                        {totalActivity}
                      </span>
                    )}
                    <div
                      className={`w-full rounded-t transition-all ${
                        isToday
                          ? 'bg-gradient-to-t from-primary to-blue-400'
                          : totalActivity > 0
                          ? 'bg-gradient-to-t from-blue-200 to-blue-100'
                          : 'bg-muted'
                      }`}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className={`text-xs ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                      周{getWeekday(stat.date)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(stat.date)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Accuracy Rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4" />
            本周正确率
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${accuracy_rate}%` }}
                />
              </div>
            </div>
            <span className="text-2xl font-bold text-green-600 min-w-[80px] text-right">
              {accuracy_rate.toFixed(1)}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            基于本周 {overview.weekly_stats.reduce((sum, s) => sum + s.words_reviewed, 0)} 次复习计算
          </p>
        </CardContent>
      </Card>

      {/* Motivational Message */}
      {progress.current_streak > 0 && (
        <Card className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200">
          <CardContent className="py-4 flex items-center gap-4">
            <div className="text-4xl">🔥</div>
            <div>
              <p className="font-semibold text-orange-800">
                太棒了！你已经连续学习 {progress.current_streak} 天了！
              </p>
              <p className="text-sm text-orange-600">
                坚持就是胜利，继续保持！
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {progress.current_streak === 0 && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="py-4 flex items-center gap-4">
            <div className="text-4xl">💪</div>
            <div>
              <p className="font-semibold text-blue-800">
                开始新的学习之旅！
              </p>
              <p className="text-sm text-blue-600">
                每天学习一点点，积累成长的力量
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
