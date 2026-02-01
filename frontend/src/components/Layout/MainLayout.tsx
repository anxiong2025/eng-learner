import { ReactNode } from 'react';
import { ArrowLeft, BookOpen, BarChart3, Github } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthDialog } from '@/components/AuthDialog';

interface MainLayoutProps {
  children: ReactNode;
  hideHeader?: boolean;
  onNavigate?: (view: 'home' | 'vocabulary' | 'stats') => void;
  currentView?: 'home' | 'vocabulary' | 'stats';
}

export function MainLayout({ children, hideHeader = false, onNavigate, currentView = 'home' }: MainLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - hidden during video learning */}
      {!hideHeader && (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-7xl mx-auto flex h-12 items-center justify-between px-4 sm:px-6">
            {/* Back to home */}
            {currentView !== 'home' ? (
              <button
                onClick={() => onNavigate?.('home')}
                className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
              </button>
            ) : (
              <div className="w-5" />
            )}

            {/* Right side - Nav + Auth */}
            <div className="flex items-center gap-1 sm:gap-2">
              {currentView !== 'vocabulary' && (
                <button
                  onClick={() => onNavigate?.('vocabulary')}
                  className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Vocabulary"
                >
                  <BookOpen className="w-4 h-4" />
                </button>
              )}
              {currentView !== 'stats' && (
                <button
                  onClick={() => onNavigate?.('stats')}
                  className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Stats"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
              )}
              <a
                href="https://github.com/anxiong2025/eng-learner"
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                title="GitHub"
              >
                <Github className="w-4 h-4" />
              </a>
              <button
                onClick={() => navigate('/about')}
                className="px-2 h-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </button>
              <AuthDialog />
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="w-full flex-1 flex items-center justify-center">
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full py-3 mt-auto border-t border-border/50">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <a href="/about" className="hover:text-foreground transition-colors">About Us</a>
          <span className="text-border">•</span>
          <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
          <span className="text-border">•</span>
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
        </div>
      </footer>
    </div>
  );
}
