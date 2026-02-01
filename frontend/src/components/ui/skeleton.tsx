import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
    />
  );
}

// Video page skeleton
export function VideoPageSkeleton() {
  return (
    <div className="bg-background">
      {/* Header skeleton */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="w-16 h-8 rounded-full" />
        </div>
      </header>

      {/* Main content */}
      <div className="h-screen pt-14 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-hidden px-6 sm:px-10 lg:px-20 py-4">
          <div className="flex flex-col lg:flex-row gap-6 max-w-[1300px] mx-auto justify-center h-full">
            {/* Left: Video skeleton */}
            <div className="flex-1 lg:max-w-[680px] flex flex-col h-full">
              {/* Video player */}
              <Skeleton className="w-full aspect-video rounded-xl" />

              {/* Subtitle card */}
              <div className="mt-3 space-y-2">
                <div className="px-4 py-3 border rounded-xl bg-muted/30">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2 mt-2" />
                </div>

                {/* Note input skeleton */}
                <div className="rounded-2xl border bg-background p-4">
                  <Skeleton className="h-4 w-1/3" />
                  <div className="flex justify-between mt-4">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Panel skeleton */}
            <div className="w-full lg:w-[450px] shrink-0 bg-background rounded-xl border border-border/30 flex flex-col overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
                <Skeleton className="h-6 w-14" />
                <Skeleton className="h-6 w-14" />
                <Skeleton className="h-6 w-14" />
                <Skeleton className="h-6 w-14" />
              </div>

              {/* Content */}
              <div className="flex-1 p-4 space-y-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// Transcript skeleton
export function TranscriptSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

// Notes skeleton
export function NotesSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="p-3 border rounded-lg space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
