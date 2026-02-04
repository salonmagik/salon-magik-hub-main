import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
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

          <h1 className="text-4xl font-semibold mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 2026</p>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-medium mb-3">1. Information We Collect</h2>
              <p className="text-muted-foreground mb-3">
                We collect information you provide directly to us, including:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Account information (name, email, phone number)</li>
                <li>Business information (salon name, address, operating hours)</li>
                <li>Customer data you enter into the Service</li>
                <li>Payment information (processed securely by our payment providers)</li>
                <li>Communications with our support team</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">2. How We Use Your Information</h2>
              <p className="text-muted-foreground mb-3">We use the information we collect to:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Provide, maintain, and improve the Service</li>
                <li>Process transactions and send related information</li>
                <li>Send technical notices, updates, and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Detect, prevent, and address technical issues</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">3. Information Sharing</h2>
              <p className="text-muted-foreground">
                We do not sell your personal information. We may share information with third parties 
                only in the following circumstances: with your consent, with service providers who 
                assist in our operations, to comply with legal obligations, or to protect our rights 
                and safety.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">4. Data Security</h2>
              <p className="text-muted-foreground">
                We implement appropriate technical and organizational measures to protect your data 
                against unauthorized access, alteration, disclosure, or destruction. This includes 
                encryption in transit and at rest, regular security assessments, and access controls.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">5. Data Retention</h2>
              <p className="text-muted-foreground">
                We retain your information for as long as your account is active or as needed to 
                provide you services. You may request deletion of your data at any time, and we 
                will comply within 30 days, subject to legal retention requirements.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">6. Your Rights</h2>
              <p className="text-muted-foreground mb-3">Depending on your location, you may have the right to:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Export your data in a portable format</li>
                <li>Object to certain processing of your data</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">7. Cookies and Tracking</h2>
              <p className="text-muted-foreground">
                We use essential cookies to maintain your session and preferences. We do not use 
                third-party advertising cookies. Analytics data is collected in aggregate form 
                to improve the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">8. Children's Privacy</h2>
              <p className="text-muted-foreground">
                The Service is not intended for children under 16. We do not knowingly collect 
                personal information from children. If you believe we have collected such 
                information, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">9. International Transfers</h2>
              <p className="text-muted-foreground">
                Your information may be transferred to and processed in countries other than your 
                own. We ensure appropriate safeguards are in place to protect your data in 
                accordance with this policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">10. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time. We will notify you of material 
                changes via email or through the Service before they take effect.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">11. Contact Us</h2>
              <p className="text-muted-foreground">
                Questions about this Privacy Policy? Contact us at{" "}
                <a href="mailto:privacy@salonmagik.com" className="text-primary hover:underline">
                  privacy@salonmagik.com
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
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Salon Magik</p>
        </div>
      </footer>
    </div>
  );
}
