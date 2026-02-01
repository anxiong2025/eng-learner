import { ReactNode, useState } from 'react';
import { Lock, Sparkles, LogIn } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuthDialog } from '@/components/AuthDialog';

interface ProFeatureGateProps {
  children: ReactNode;
  feature: string;
  description?: string;
  fallback?: ReactNode;
}

export function ProFeatureGate({
  children,
  feature,
  description,
  fallback,
}: ProFeatureGateProps) {
  const { isAuthenticated, isProUser } = useAuthStore();

  // If user is Pro, show the feature
  if (isAuthenticated && isProUser()) {
    return <>{children}</>;
  }

  // If fallback is provided, show it
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default: show locked state
  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none blur-[2px]">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-lg">
        <div className="text-center p-6 max-w-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-4">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold text-lg mb-2">{feature}</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {description || 'Upgrade to Pro to unlock this feature'}
          </p>
          <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
            <Sparkles className="w-4 h-4 mr-2" />
            Upgrade to Pro
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ProBadgeProps {
  className?: string;
}

export function ProBadge({ className }: ProBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white ${className}`}
    >
      <Sparkles className="w-3 h-3" />
      PRO
    </span>
  );
}

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Login Gate - requires user to be logged in (free feature, just needs account)
interface LoginGateProps {
  children: ReactNode;
  feature: string;
  description?: string;
  mode?: 'overlay' | 'replace'; // overlay = blur content, replace = show prompt instead
}

export function LoginGate({
  children,
  feature,
  description,
  mode = 'replace',
}: LoginGateProps) {
  const { isAuthenticated } = useAuthStore();
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // If user is logged in, show the feature
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Show login prompt
  if (mode === 'overlay') {
    return (
      <div className="relative h-full">
        <div className="opacity-30 pointer-events-none blur-[1px]">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-4 max-w-xs">
            <LogIn className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">{feature}</p>
            <p className="text-xs text-muted-foreground mb-3">
              {description || 'Sign in for more features'}
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowAuthDialog(true)}>
              Sign In
            </Button>
            <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} showTrigger={false} />
          </div>
        </div>
      </div>
    );
  }

  // Replace mode - show prompt instead of content
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center p-4 max-w-xs">
        <LogIn className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
        <p className="text-sm font-medium mb-1">{feature}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {description || 'Sign in for more features'}
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowAuthDialog(true)}>
          Sign In
        </Button>
        <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} showTrigger={false} />
      </div>
    </div>
  );
}

export function UpgradeDialog({ open, onOpenChange }: UpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Upgrade to Pro
          </DialogTitle>
          <DialogDescription>
            Unlock all premium features to accelerate your English learning
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm">Save & Sync Mind Maps</p>
                <p className="text-muted-foreground text-xs">
                  Save mind maps for each video and access them anytime
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm">Advanced AI Explanations</p>
                <p className="text-muted-foreground text-xs">
                  Get detailed grammar analysis and cultural context
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm">Export Your Data</p>
                <p className="text-muted-foreground text-xs">
                  Export vocabulary, notes, and progress to various formats
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm">Unlimited Notes</p>
                <p className="text-muted-foreground text-xs">
                  Save unlimited notes across all your videos
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
            <Sparkles className="w-4 h-4 mr-2" />
            Upgrade Now
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Coming soon! Stay tuned for our Pro launch.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
