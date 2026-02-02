import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-foreground mb-8">Privacy Policy</h1>

        <div className="space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">1. Information We Collect</h2>
            <p className="mb-4">We collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-foreground">Account Information:</strong> When you sign in
                with Google, we receive your email address and basic profile information.
              </li>
              <li>
                <strong className="text-foreground">Usage Data:</strong> We collect information about
                how you use the Service, including videos watched, vocabulary saved, and learning progress.
              </li>
              <li>
                <strong className="text-foreground">Device Information:</strong> Basic information about
                your device and browser to improve the Service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide and maintain the Service</li>
              <li>To personalize your learning experience</li>
              <li>To track your learning progress and vocabulary</li>
              <li>To improve and optimize the Service</li>
              <li>To communicate with you about updates or support</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">3. Data Storage and Security</h2>
            <p className="mb-4">
              Your data is stored securely using industry-standard encryption and security practices.
              We use trusted third-party services (Firebase, Google Cloud) to store and process your data.
            </p>
            <p>
              While we take reasonable measures to protect your information, no method of transmission
              over the Internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">4. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>
                <strong className="text-foreground">Google Authentication:</strong> For secure sign-in
              </li>
              <li>
                <strong className="text-foreground">Firebase:</strong> For data storage and analytics
              </li>
              <li>
                <strong className="text-foreground">YouTube:</strong> For video content (subject to
                YouTube's Terms of Service)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">5. Cookies and Tracking</h2>
            <p>
              We use cookies and similar technologies to maintain your session, remember your preferences,
              and analyze usage patterns to improve the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">6. Your Rights</h2>
            <p className="mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access your personal data</li>
              <li>Request correction of your data</li>
              <li>Request deletion of your account and data</li>
              <li>Export your learning data</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, please contact us at{' '}
              <a href="mailto:contact@tubemo.com" className="text-primary hover:underline">
                contact@tubemo.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">7. Children's Privacy</h2>
            <p>
              The Service is not intended for children under 13. We do not knowingly collect personal
              information from children under 13. If you believe we have collected information from
              a child under 13, please contact us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes
              by posting the new Privacy Policy on this page with an updated effective date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">9. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at{' '}
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
