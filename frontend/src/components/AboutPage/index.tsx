import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50">
        <div className="flex h-14 items-center px-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-pink-600 bg-clip-text text-transparent">
              TubeMo
            </span>
          </h1>
          <p className="text-lg text-muted-foreground italic">
            Learn by doing. Remember by understanding.
          </p>
        </div>

        {/* The Name */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4">The Name</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            <strong className="text-foreground">TubeMo</strong> combines{' '}
            <strong className="text-foreground">Tube</strong> (from YouTube, the world's
            largest video platform) with <strong className="text-foreground">Mo</strong> (short
            for Memory, Motion, and Momentum).
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We believe the best way to learn a language is through content you actually
            enjoy watching. TubeMo transforms passive video watching into an active
            learning experience.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground">AI</strong> is your intelligent companion
            on this journey, helping you understand context, explain nuances,
            and remember what matters.
          </p>
        </section>

        {/* Philosophy */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4">Our Philosophy</h2>

          <div className="space-y-6">
            <div>
              <h3 className="font-medium text-foreground mb-2">Interest-Driven Learning</h3>
              <p className="text-muted-foreground leading-relaxed">
                The best learning happens when you're genuinely curious. That's why TubeMo
                lets you learn from content you actually want to watch — tech talks,
                startup stories, science explainers, or anything that sparks your interest.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">Active Over Passive</h3>
              <p className="text-muted-foreground leading-relaxed mb-2">
                Watching videos is passive. TubeMo transforms it into an active experience:
              </p>
              <ul className="text-muted-foreground space-y-1 ml-4">
                <li>• <strong className="text-foreground">Pause and ask</strong> — Stop anytime to ask AI about what you just heard</li>
                <li>• <strong className="text-foreground">Highlight and save</strong> — Build your personal vocabulary from real context</li>
                <li>• <strong className="text-foreground">Review and recall</strong> — Spaced repetition helps you remember</li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">Context is Everything</h3>
              <p className="text-muted-foreground leading-relaxed">
                Words aren't learned in isolation. TubeMo keeps the full context — the video,
                the sentence, the moment — so you remember not just what a word means,
                but how it's actually used.
              </p>
            </div>
          </div>
        </section>

        {/* Quote */}
        <section className="text-center py-8 border-t border-border/50">
          <blockquote className="text-lg italic text-muted-foreground">
            "The limits of my language mean the limits of my world."
          </blockquote>
          <p className="text-sm text-muted-foreground/60 mt-2">— Ludwig Wittgenstein</p>
        </section>
      </main>
    </div>
  );
}
