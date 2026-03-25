import { useState } from 'react';
import { ArrowLeft, Download, Link2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DAILY_LIMIT = 5;
const STORAGE_KEY = 'video-download-usage';

interface DownloadUsage {
  date: string;
  count: number;
}

function getUsage(): DownloadUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const usage = JSON.parse(raw) as DownloadUsage;
      const today = new Date().toISOString().slice(0, 10);
      if (usage.date === today) return usage;
    }
  } catch { /* ignore */ }
  return { date: new Date().toISOString().slice(0, 10), count: 0 };
}

function incrementUsage() {
  const usage = getUsage();
  usage.count += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

function isValidUrl(url: string): boolean {
  // YouTube
  if (/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/.test(url)) return true;
  // X / Twitter
  if (/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url)) return true;
  return false;
}

export function VideoDownload() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const usage = getUsage();
  const remaining = DAILY_LIMIT - usage.count;

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmed = url.trim();
    if (!trimmed) return;

    if (!isValidUrl(trimmed)) {
      setError('Please enter a valid YouTube or X (Twitter) video link.');
      return;
    }

    if (remaining <= 0) {
      setError('Daily download limit reached (5/day). Please try again tomorrow.');
      return;
    }

    setLoading(true);

    try {
      const resp = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: trimmed,
          downloadMode: 'auto',
          filenameStyle: 'pretty',
        }),
      });

      const data = await resp.json();

      if (data.status === 'tunnel' || data.status === 'redirect') {
        // Direct download URL
        incrementUsage();
        setSuccess('Download starting...');

        // Trigger browser download
        const a = document.createElement('a');
        a.href = data.url;
        a.download = '';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setUrl('');
      } else if (data.status === 'picker') {
        // Multiple options (e.g. video + audio), pick the first video
        incrementUsage();
        setSuccess('Download starting...');

        const videoItem = data.picker?.find((item: { type?: string }) => item.type === 'video') || data.picker?.[0];
        if (videoItem?.url) {
          const a = document.createElement('a');
          a.href = videoItem.url;
          a.download = '';
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          setError('Could not find a downloadable video.');
        }

        setUrl('');
      } else if (data.status === 'error') {
        setError(data.error?.code === 'error.api.link.unsupported'
          ? 'This link is not supported. Please try a different video.'
          : data.error?.code || 'Download failed. Please try a different link.');
      } else {
        setError('Unexpected response. Please try again.');
      }
    } catch (err) {
      setError('Network error. The download service may be temporarily unavailable. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-[600px] mx-auto px-6 py-16">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Title */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Download className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Video Download</h1>
          <p className="text-sm text-muted-foreground">
            Paste a YouTube or X (Twitter) video link to download
          </p>
        </div>

        {/* Input form */}
        <form onSubmit={handleDownload} className="mb-6">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=... or https://x.com/..."
                className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-all flex items-center gap-2 shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download
            </button>
          </div>
        </form>

        {/* Status messages */}
        {error && (
          <div className="flex items-start gap-2 p-3 mb-4 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 p-3 mb-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            {success}
          </div>
        )}

        {/* Usage info */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-xs text-muted-foreground">
            <span>Today: {usage.count}/{DAILY_LIMIT}</span>
            <span className="text-muted-foreground/40">|</span>
            <span>{remaining > 0 ? `${remaining} remaining` : 'Limit reached'}</span>
          </div>
        </div>

        {/* Supported platforms */}
        <div className="mt-10 pt-6 border-t border-border/50">
          <h3 className="text-xs font-medium text-muted-foreground mb-3 text-center">Supported Platforms</h3>
          <div className="flex justify-center gap-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
                <path d="M9.545 15.568V8.432L15.818 12z" fill="white"/>
              </svg>
              YouTube
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              X (Twitter)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
