import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/">
            <SalonMagikLogo size="md" />
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/pricing">
              <Button variant="ghost" size="sm">
                Pricing
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <h1 className="text-4xl font-semibold mb-4">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 2026</p>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-medium mb-3">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By accessing or using Salon Magik ("Service"), you agree to be bound by these Terms of 
                Service. If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">2. Description of Service</h2>
              <p className="text-muted-foreground">
                Salon Magik provides salon management software including appointment scheduling, 
                payment processing, customer management, and related business tools. The Service 
                is provided on a subscription basis.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">3. Account Registration</h2>
              <p className="text-muted-foreground">
                You must provide accurate and complete information when creating an account. You are 
                responsible for maintaining the security of your account credentials and for all 
                activities that occur under your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">4. Subscription and Billing</h2>
              <p className="text-muted-foreground">
                Subscriptions are billed monthly or annually as selected. All fees are non-refundable 
                except as required by law or as explicitly stated in our refund policy. We reserve the 
                right to change pricing with 30 days notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">5. Acceptable Use</h2>
              <p className="text-muted-foreground">
                You agree not to use the Service for any unlawful purpose or in any way that could 
                damage, disable, or impair the Service. You may not attempt to gain unauthorized 
                access to any part of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">6. Data and Privacy</h2>
              <p className="text-muted-foreground">
                Your use of the Service is also governed by our Privacy Policy. You retain ownership 
                of your data and may export or delete it at any time through the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">7. Termination</h2>
              <p className="text-muted-foreground">
                Either party may terminate the subscription at any time. Upon termination, your 
                access to the Service will cease at the end of the current billing period. We may 
                suspend or terminate accounts that violate these terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">8. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                The Service is provided "as is" without warranties of any kind. We shall not be 
                liable for any indirect, incidental, special, or consequential damages arising 
                from your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">9. Changes to Terms</h2>
              <p className="text-muted-foreground">
                We may update these terms from time to time. We will notify you of material changes 
                via email or through the Service. Continued use after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">10. Contact</h2>
              <p className="text-muted-foreground">
                Questions about these terms? Contact us at{" "}
                <a href="mailto:legal@salonmagik.com" className="text-primary hover:underline">
                  legal@salonmagik.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 mt-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <SalonMagikLogo size="sm" />
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link to="/support" className="hover:text-foreground transition-colors">
              Support
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Salon Magik</p>
        </div>
      </footer>
    </div>
  );
}
