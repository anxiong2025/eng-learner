import { ReactNode } from 'react';
import { BookOpen, Settings, GraduationCap, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MainLayoutProps {
  children: ReactNode;
  hideHeader?: boolean;
  onNavigate?: (view: 'home' | 'vocabulary' | 'stats') => void;
  currentView?: 'home' | 'vocabulary' | 'stats';
}

export function MainLayout({ children, hideHeader = false, onNavigate, currentView = 'home' }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header - hidden during video learning */}
      {!hideHeader && (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-7xl mx-auto flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6">
            <div
              className="flex items-center gap-2 sm:gap-3 cursor-pointer"
              onClick={() => onNavigate?.('home')}
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
                <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight">EngLearner</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Learn English with YouTube</p>
              </div>
            </div>

            <nav className="flex items-center gap-1 sm:gap-2">
              <Button
                variant={currentView === 'vocabulary' ? 'default' : 'ghost'}
                size="sm"
                className="px-2 sm:px-3"
                onClick={() => onNavigate?.('vocabulary')}
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">单词本</span>
              </Button>
              <Button
                variant={currentView === 'stats' ? 'default' : 'ghost'}
                size="sm"
                className="px-2 sm:px-3"
                onClick={() => onNavigate?.('stats')}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">统计</span>
              </Button>
              <Button variant="outline" size="sm" className="px-2 sm:px-3">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">设置</span>
              </Button>
            </nav>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
