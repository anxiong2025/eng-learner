import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { LogOut, Check, Zap, Gift } from 'lucide-react';
import { useAuthStore, type User } from '@/store/authStore';
import { getUsageStatus, getInviteCode, API_BASE, emailRegister, emailLogin, sendVerificationCode, verifyEmail } from '@/api/client';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';

// Dropdown menu for logged-in user
function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Fetch usage and invite info on mount
  useEffect(() => {
    getUsageStatus().then(data => {
      setUsageInfo(data.video_parse);
    }).catch(() => {});

    getInviteCode().then(data => {
      setInviteLink(data.invite_link);
    }).catch(() => {});
  }, []);

  const handleCopyInvite = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      // Reset after delay
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-8 h-8 flex items-center justify-center text-xl font-light text-muted-foreground hover:text-foreground transition-colors outline-none"
          title={user.name || user.email}
        >
          ∞
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal pb-3">
          <div className="flex flex-col space-y-1">
            {user.name && <p className="text-sm font-medium leading-none">{user.name}</p>}
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Usage info */}
        {usageInfo && (
          <>
            <div className="px-2 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Today
                </span>
                <span className="text-xs font-medium tabular-nums">
                  {usageInfo.used}/{usageInfo.limit}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {/* Invite friends - click to copy */}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={handleCopyInvite}
          className={`cursor-pointer transition-all duration-200 ${
            copied
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
              : ''
          }`}
        >
          {copied ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Gift className="mr-2 h-4 w-4 text-emerald-600" />
          )}
          <span className="flex-1">
            {copied ? 'Copied!' : 'Invite Friends'}
          </span>
          {!copied && (
            <span className="text-[10px] text-emerald-600 font-medium">+3</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-muted-foreground">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Social login icons as SVG components
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const GitHubIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
    />
  </svg>
);

interface AuthDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function AuthDialog({ open: controlledOpen, onOpenChange, showTrigger = true }: AuthDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const { user, isAuthenticated, login, logout } = useAuthStore();

  // Email auth state
  type AuthView = 'main' | 'login' | 'register' | 'verify';
  const [view, setView] = useState<AuthView>('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setView('main');
      setEmail('');
      setPassword('');
      setName('');
      setCode('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  const handleSocialLogin = (provider: 'google' | 'github') => {
    localStorage.setItem('auth-return-url', window.location.href);
    const refCode = localStorage.getItem('invite-ref-code');
    const url = refCode
      ? `${API_BASE}/auth/${provider}?ref_code=${encodeURIComponent(refCode)}`
      : `${API_BASE}/auth/${provider}`;
    window.location.href = url;
  };

  const handleEmailLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await emailLogin(email, password);
      await login(result.token);
      setIsOpen(false);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Login failed';
      const code = e?.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        setView('verify');
        setResendCountdown(60);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async () => {
    setError('');
    setLoading(true);
    try {
      await emailRegister(email, password, name);
      setView('verify');
      setResendCountdown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await verifyEmail(email, code);
      await login(result.token);
      setIsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0) return;
    setError('');
    try {
      await sendVerificationCode(email);
      setResendCountdown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resend code');
    }
  };

  const handleLogout = () => {
    logout();
  };

  if (isAuthenticated && user && showTrigger) {
    return <UserMenu user={user} onLogout={handleLogout} />;
  }

  if (isAuthenticated && !showTrigger) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign In
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        <div className="p-6">
          {view === 'main' && (
            <>
              <DialogHeader className="text-center pb-4">
                <DialogTitle className="text-xl font-semibold">Sign in</DialogTitle>
                <DialogDescription>Unlock more features and sync your progress</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Button variant="outline" className="w-full h-11 font-medium" onClick={() => handleSocialLogin('google')}>
                  <GoogleIcon />
                  Continue with Google
                </Button>
                <Button variant="outline" className="w-full h-11 font-medium" onClick={() => handleSocialLogin('github')}>
                  <GitHubIcon />
                  Continue with GitHub
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button variant="outline" className="w-full h-11 font-medium" onClick={() => setView('login')}>
                  <Mail className="w-5 h-5 mr-2" />
                  Continue with Email
                </Button>
              </div>
            </>
          )}

          {view === 'login' && (
            <>
              <DialogHeader className="text-center pb-4">
                <DialogTitle className="text-xl font-semibold">Sign in with Email</DialogTitle>
                <DialogDescription>Enter your email and password</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailLogin()}
                  className="w-full h-11 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full h-11" onClick={handleEmailLogin} disabled={loading || !email || !password}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Sign In
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Don't have an account?{' '}
                  <button className="text-primary hover:underline font-medium" onClick={() => { setError(''); setView('register'); }}>
                    Sign Up
                  </button>
                </p>
                <button className="flex items-center text-sm text-muted-foreground hover:text-foreground mx-auto" onClick={() => { setError(''); setView('main'); }}>
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                </button>
              </div>
            </>
          )}

          {view === 'register' && (
            <>
              <DialogHeader className="text-center pb-4">
                <DialogTitle className="text-xl font-semibold">Create Account</DialogTitle>
                <DialogDescription>Sign up with your email</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="password"
                  placeholder="Password (min 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailRegister()}
                  className="w-full h-11 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full h-11" onClick={handleEmailRegister} disabled={loading || !email || !password || !name || password.length < 8}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Account
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <button className="text-primary hover:underline font-medium" onClick={() => { setError(''); setView('login'); }}>
                    Sign In
                  </button>
                </p>
                <button className="flex items-center text-sm text-muted-foreground hover:text-foreground mx-auto" onClick={() => { setError(''); setView('main'); }}>
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                </button>
              </div>
            </>
          )}

          {view === 'verify' && (
            <>
              <DialogHeader className="text-center pb-4">
                <DialogTitle className="text-xl font-semibold">Verify Email</DialogTitle>
                <DialogDescription>We sent a 6-digit code to {email}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleVerifyCode()}
                  className="w-full h-11 px-3 rounded-md border border-input bg-background text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  maxLength={6}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full h-11" onClick={handleVerifyCode} disabled={loading || code.length !== 6}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Verify
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Didn't receive the code?{' '}
                  {resendCountdown > 0 ? (
                    <span className="text-muted-foreground">Resend in {resendCountdown}s</span>
                  ) : (
                    <button className="text-primary hover:underline font-medium" onClick={handleResendCode}>
                      Resend
                    </button>
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
