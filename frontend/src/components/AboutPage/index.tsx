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
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Menmo Action AI
          </h1>
          <p className="text-lg text-muted-foreground italic">
            Learn by doing. Remember by understanding.
          </p>
        </div>

        {/* The Name */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4">The Name</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            <strong className="text-foreground">Menmo</strong> is inspired by{' '}
            <strong className="text-foreground">Mnemosyne</strong> (Μνημοσύνη),
            the ancient Greek goddess of memory and mother of the nine Muses.
            In mythology, she was the personification of remembrance — the foundation
            of all learning, art, and knowledge.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We simplified her name to <strong className="text-foreground">Menmo</strong> —
            easier to say, easier to remember, just like learning should be.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            <strong className="text-foreground">Action</strong> reflects our core belief:
            true learning happens through doing, not passive consumption.
            Watch, interact, question, repeat.
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
                The best learning happens when you're genuinely curious. That's why Menmo
                lets you learn from content you actually want to watch — tech talks,
                startup stories, science explainers, or anything that sparks your interest.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">Active Over Passive</h3>
              <p className="text-muted-foreground leading-relaxed mb-2">
                Watching videos is passive. Menmo transforms it into an active experience:
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
                Words aren't learned in isolation. Menmo keeps the full context — the video,
                the sentence, the moment — so you remember not just what a word means,
                but how it's actually used.
              </p>
            </div>
          </div>
        </section>

        {/* Quote */}
        <section className="text-center py-8 border-t border-border/50">
          <blockquote className="text-lg italic text-muted-foreground">
            "Memory is the mother of all wisdom."
          </blockquote>
          <p className="text-sm text-muted-foreground/60 mt-2">— Aeschylus</p>
        </section>
      </main>
    </div>
  );
}
