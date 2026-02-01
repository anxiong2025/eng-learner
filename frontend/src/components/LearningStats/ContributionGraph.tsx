import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DailyStats } from '@/api/client';

interface ContributionGraphProps {
  stats: DailyStats[];
}

function getActivityColor(count: number, maxCount: number): string {
  if (count === 0) return 'bg-muted';
  const ratio = count / maxCount;
  if (ratio < 0.25) return 'bg-green-200';
  if (ratio < 0.5) return 'bg-green-400';
  if (ratio < 0.75) return 'bg-green-500';
  return 'bg-green-600';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ContributionGraph({ stats }: ContributionGraphProps) {
  const { weeks, monthLabels, maxActivity, totalActivity, activeDays } = useMemo(() => {
    const statsMap = new Map<string, DailyStats>();
    stats.forEach(s => statsMap.set(s.date, s));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();

    // Filter stats for current year only
    const currentYearStats = stats.filter(s => new Date(s.date).getFullYear() === currentYear);

    let max = 1;
    let total = 0;
    let active = 0;
    currentYearStats.forEach(s => {
      const activity = s.words_learned + s.words_reviewed;
      if (activity > max) max = activity;
      total += activity;
      if (activity > 0) active++;
    });

    const weeks: { date: string; count: number; isCurrentYear: boolean }[][] = [];

    // Start from January 1st of current year, adjust to previous Sunday
    const startDate = new Date(currentYear, 0, 1);
    while (startDate.getDay() !== 0) {
      startDate.setDate(startDate.getDate() - 1);
    }

    const months: { label: string; weekIndex: number }[] = [];
    let lastMonth = -1;

    let currentDate = new Date(startDate);
    let weekIndex = 0;

    while (currentDate <= today) {
      const week: { date: string; count: number; isCurrentYear: boolean }[] = [];

      for (let day = 0; day < 7 && currentDate <= today; day++) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const stat = statsMap.get(dateStr);
        const count = stat ? stat.words_learned + stat.words_reviewed : 0;
        const isCurrentYear = currentDate.getFullYear() === currentYear;

        // Track month labels (only for current year, only first occurrence)
        if (isCurrentYear && currentDate.getMonth() !== lastMonth) {
          lastMonth = currentDate.getMonth();
          months.push({
            label: currentDate.toLocaleDateString('en-US', { month: 'short' }),
            weekIndex
          });
        }

        week.push({ date: dateStr, count, isCurrentYear });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      weeks.push(week);
      weekIndex++;
    }

    return { weeks, monthLabels: months, maxActivity: max, totalActivity: total, activeDays: active };
  }, [stats]);

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {new Date().getFullYear()}: <span className="font-medium text-foreground">{totalActivity}</span> words, <span className="font-medium text-foreground">{activeDays}</span> active days
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Month labels */}
          <div className="flex mb-1 h-4 ml-6">
            <div className="relative flex-1">
              {monthLabels.map((month) => (
                <span
                  key={month.weekIndex}
                  className="absolute text-xs text-muted-foreground"
                  style={{ left: `${month.weekIndex * 14}px` }}
                >
                  {month.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-[2px]">
            {/* Day labels */}
            <div className="flex flex-col text-[10px] text-muted-foreground gap-[2px] w-5">
              <div className="h-3" />
              <div className="h-3 leading-3">M</div>
              <div className="h-3" />
              <div className="h-3 leading-3">W</div>
              <div className="h-3" />
              <div className="h-3 leading-3">F</div>
              <div className="h-3" />
            </div>

            {/* Grid */}
            <TooltipProvider delayDuration={100}>
              <div className="flex gap-[2px]">
                {weeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-[2px]">
                    {week.map((day, dayIdx) => (
                      <Tooltip key={`${weekIdx}-${dayIdx}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={`w-3 h-3 rounded-sm ${
                              day.isCurrentYear
                                ? getActivityColor(day.count, maxActivity)
                                : 'bg-transparent'
                            }`}
                          />
                        </TooltipTrigger>
                        {day.isCurrentYear && (
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">{formatDate(day.date)}</p>
                            <p className="text-muted-foreground">
                              {day.count > 0 ? `${day.count} words` : 'No activity'}
                            </p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </div>
            </TooltipProvider>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-muted-foreground">
            <span>Less</span>
            <div className="flex gap-[2px]">
              <div className="w-3 h-3 rounded-sm bg-muted" />
              <div className="w-3 h-3 rounded-sm bg-green-200" />
              <div className="w-3 h-3 rounded-sm bg-green-400" />
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <div className="w-3 h-3 rounded-sm bg-green-600" />
            </div>
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
