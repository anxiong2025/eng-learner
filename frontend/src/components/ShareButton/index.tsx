import { useState } from 'react';
import { Share2, Twitter, Link2, Check, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  className?: string;
  variant?: 'icon' | 'full';
}

export function ShareButton({
  title,
  text,
  url,
  className,
  variant = 'icon'
}: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = url || window.location.href;
  const shareText = text || title;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or error
        console.log('Share cancelled');
      }
    } else {
      setIsOpen(!isOpen);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareToTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  const shareToWeChat = () => {
    // WeChat doesn't have a direct share URL, show QR code or copy link
    handleCopyLink();
  };

  // Check if native share is available
  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  if (variant === 'icon') {
    return (
      <div className="relative">
        <button
          onClick={handleNativeShare}
          className={cn(
            "p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
            className
          )}
          title="Share"
        >
          <Share2 className="w-4 h-4" />
        </button>

        {/* Dropdown for non-native share */}
        {!hasNativeShare && isOpen && (
          <div className="absolute top-full right-0 mt-2 w-48 bg-background border border-border rounded-xl shadow-lg p-2 z-50">
            <button
              onClick={shareToTwitter}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              <Twitter className="w-4 h-4" />
              Share on X
            </button>
            <button
              onClick={shareToWeChat}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WeChat (Copy Link)
            </button>
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Link2 className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Full variant with text
  return (
    <div className="relative">
      <button
        onClick={handleNativeShare}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium transition-colors",
          className
        )}
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>

      {!hasNativeShare && isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-background border border-border rounded-xl shadow-lg p-2 z-50">
          <button
            onClick={shareToTwitter}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <Twitter className="w-4 h-4" />
            Share on X
          </button>
          <button
            onClick={shareToWeChat}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WeChat (Copy Link)
          </button>
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Link2 className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}
    </div>
  );
}

// Video-specific share component
interface VideoShareProps {
  videoId: string;
  videoTitle: string;
  className?: string;
}

export function VideoShare({ videoId, videoTitle, className }: VideoShareProps) {
  return (
    <ShareButton
      title={`Learn English with "${videoTitle}" on TubeMo`}
      text={`I'm learning English with this video on TubeMo! Check it out:`}
      url={`https://tubemo.com/watch/${videoId}`}
      className={className}
    />
  );
}
