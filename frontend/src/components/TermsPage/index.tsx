import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function TermsPage() {
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
        <h1 className="text-3xl font-bold text-foreground mb-8">Terms of Service</h1>

        <div className="space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing and using Menmo Action AI ("the Service"), you agree to be bound by these
              Terms of Service. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">2. Description of Service</h2>
            <p>
              Menmo Action AI is an educational platform that helps users learn through video content
              by providing bilingual subtitles, AI-powered mind maps, vocabulary tools, and other
              learning features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">3. User Responsibilities</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must be at least 13 years old to use the Service.</li>
              <li>You are responsible for maintaining the confidentiality of your account.</li>
              <li>You agree not to use the Service for any illegal or unauthorized purposes.</li>
              <li>You must not violate any laws in your jurisdiction when using the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">4. Content and Intellectual Property</h2>
            <p className="mb-4">
              The Service processes third-party video content (such as YouTube videos) for educational
              purposes. We do not claim ownership of any third-party content.
            </p>
            <p>
              All features, tools, and original content created by Menmo Action AI are protected by
              intellectual property laws. You may not copy, modify, or distribute our proprietary
              content without permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">5. Usage Limits</h2>
            <p>
              Free users are subject to daily usage limits. These limits may change at our discretion.
              Premium features may be introduced in the future with additional capabilities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">6. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" without warranties of any kind, either express or implied.
              We do not guarantee that the Service will be uninterrupted, secure, or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Menmo Action AI shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages resulting from your
              use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">8. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify users of any
              material changes by posting the new Terms on this page with an updated effective date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">9. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please contact us at{' '}
              <a href="mailto:contact@tubemo.com" className="text-primary hover:underline">
                contact@tubemo.com
              </a>.
            </p>
          </section>

          <p className="text-sm text-muted-foreground/60 pt-8 border-t border-border/50">
            Last updated: February 2026
          </p>
        </div>
      </main>
    </div>
  );
}
