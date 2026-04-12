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
          <p className="text-muted-foreground mb-8">Last updated: April 12, 2026</p>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-medium mb-3">1. Acceptance of These Terms</h2>
              <p className="text-muted-foreground">
                These Terms of Service govern access to and use of Salon Magik. By accessing,
                registering for, connecting to, or using the Service, you agree to be bound by
                these Terms. If you are using the Service on behalf of a business, salon, chain,
                branch group, or other organization, you represent that you have authority to bind
                that organization and its authorized users to these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">2. Contracting Party and Service Operator</h2>
              <p className="text-muted-foreground">
                Salon Magik is a product of <strong>The Gray Avenue LTD</strong>. References to
                {" "}“Salon Magik,” “we,” “us,” or “our” refer to the Salon Magik product and The
                Gray Avenue LTD, including related entities, affiliates, contractors, service
                providers, and operational support structures involved in providing the Service in
                Nigeria and Ghana. We may provide parts of the Service through affiliates, partners,
                or third-party infrastructure while remaining responsible for the contractual service
                relationship unless expressly stated otherwise.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">3. Description of the Service</h2>
              <p className="text-muted-foreground">
                Salon Magik provides software and related infrastructure for beauty and wellness
                businesses, including booking management, customer records, messaging, staff and
                branch administration, reporting, billing, payment-related workflows, wallet or purse
                features, withdrawals, refunds, authentication, public booking experiences, and
                related business tools. Features may change over time, may vary by environment or
                region, and may be introduced, modified, suspended, or discontinued at our
                discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">4. Eligibility, Accounts, and Security</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>You must provide accurate, current, and complete information when registering and using the Service.</li>
                <li>You are responsible for safeguarding credentials, authenticators, devices, and any access granted to your account or workspace.</li>
                <li>You are responsible for activities carried out under your account, tenant, or workspace by your employees, contractors, invited staff, administrators, and other authorized users.</li>
                <li>We may support password, OTP, social sign-in, and invitation-based access flows. Third-party authentication providers are outside our control and may impose separate terms or availability constraints.</li>
                <li>We may require password changes, step-up verification, re-authentication, or account review for security, onboarding, provider, or compliance reasons.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">5. Customer Data and User Responsibilities</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>You retain responsibility for the accuracy, lawfulness, and integrity of data you or your users upload, create, or manage through the Service.</li>
                <li>You must have a lawful basis to collect, use, message, store, and otherwise process customer and staff data in the Service.</li>
                <li>You are responsible for obtaining any notices, consents, permissions, or approvals required for email, SMS, WhatsApp, booking, marketing, support, or other customer communications you send through the platform.</li>
                <li>You remain responsible for configuring staff roles, permissions, and workspace access appropriately.</li>
                <li>You must not use the Service to store or process data in a manner that violates law, professional obligations, third-party rights, or industry-specific requirements applicable to you.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">6. Payments, Wallets, Purses, Credits, Refunds, and Withdrawals</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Payment, subscription, credit, purse, wallet, refund, and withdrawal features may depend on third-party providers and may be subject to additional checks, holds, reversals, fees, delays, restrictions, or provider failures.</li>
                <li>We may delay, reject, reverse, suspend, limit, investigate, or request additional verification for transactions where reasonably necessary for fraud prevention, anti-money laundering, sanctions compliance, dispute management, reconciliation, chargeback risk, legal obligations, or platform integrity.</li>
                <li>Displayed balances, credits, wallet values, transaction statuses, and payout timelines may be provisional until confirmed through internal controls and external provider reconciliation.</li>
                <li>Fees are generally non-refundable except where required by law or expressly stated otherwise by us in writing.</li>
                <li>We do not guarantee uninterrupted payment availability, payout completion, processor uptime, currency support, or provider approval.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">7. Acceptable Use</h2>
              <p className="text-muted-foreground mb-3">
                You must not, and must not permit others to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>use the Service for unlawful, fraudulent, abusive, deceptive, harassing, or infringing purposes;</li>
                <li>send spam, unauthorized marketing, or prohibited messaging through any channel;</li>
                <li>attempt unauthorized access, privilege escalation, credential sharing beyond authorized use, or circumvention of security controls;</li>
                <li>reverse engineer, scrape, disrupt, overload, or interfere with the Service or connected systems except where law expressly prohibits such restriction;</li>
                <li>misrepresent identity, business status, payment status, or authority to act on behalf of another person or business; or</li>
                <li>use the Service in a way that exposes us, our providers, or other users to regulatory, sanctions, financial crime, reputational, or legal risk.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">8. Privacy and Data Handling</h2>
              <p className="text-muted-foreground">
                Our handling of information is described in our Privacy Policy. As between us and the
                salon or business customer, Salon Magik generally acts as controller for its own
                account, billing, platform, security, and operational data, while the salon is
                generally responsible as controller for its own end-customer data entered into the
                Service. You agree to comply with your own privacy, messaging, consumer, employment,
                tax, financial, and sector-specific obligations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">9. Suspension, Restriction, and Termination</h2>
              <p className="text-muted-foreground">
                We may suspend, restrict, condition, or terminate access to all or part of the
                Service immediately or over time if we reasonably believe there is a breach of these
                Terms, fraud risk, security concern, non-payment, sanctions or compliance issue,
                provider requirement, legal compulsion, dispute risk, operational abuse, or material
                harm to us, our users, or third parties. We may also discontinue features, regions,
                or integrations in whole or in part.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">10. Account Closure, Deactivation, and Retention</h2>
              <p className="text-muted-foreground mb-3">
                We do not provide a general self-serve account deletion mechanism. Accounts may be
                closed or deactivated by request or by us in accordance with these Terms and our
                legal, financial, fraud-prevention, security, audit, accounting, and compliance
                obligations.
              </p>
              <p className="text-muted-foreground">
                Following closure or deactivation, we may retain transaction history, audit logs,
                payout and refund records, billing records, identity verification records, security
                data, dispute records, regulatory logs, backups, and other records required to
                protect the platform, comply with law, or preserve evidence.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">11. Intellectual Property and Feedback</h2>
              <p className="text-muted-foreground">
                You retain rights in data you lawfully provide to the Service. We retain all rights
                in the Service itself, including the software, branding, interfaces, workflows,
                templates, documentation, and related intellectual property. Subject to these Terms,
                we grant you a limited, revocable, non-exclusive, non-transferable right to use the
                Service for your internal business purposes. If you provide feedback, ideas, or
                suggestions, you grant us the right to use them without restriction or compensation.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">12. Warranties and Disclaimers</h2>
              <p className="text-muted-foreground">
                The Service is provided on an “as available” and “as is” basis. To the fullest
                extent permitted by law, we disclaim warranties of merchantability, fitness for a
                particular purpose, title, non-infringement, uninterrupted availability, error-free
                operation, or guaranteed compatibility with third-party systems, processors, devices,
                carriers, or network conditions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">13. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                To the fullest extent permitted by law, we will not be liable for indirect,
                incidental, special, consequential, exemplary, punitive, or loss-of-profit damages,
                or for loss of data, goodwill, customers, business opportunity, or anticipated
                savings arising from or related to the Service. Our aggregate liability arising out
                of or relating to the Service will be limited to the amounts paid by you to us for
                the Service during the twelve months preceding the event giving rise to the claim,
                except to the extent a greater limitation is prohibited by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">14. Indemnity</h2>
              <p className="text-muted-foreground">
                You agree to defend, indemnify, and hold harmless Salon Magik, The Gray Avenue LTD,
                their affiliates, personnel, and service providers from claims, liabilities, losses,
                costs, and expenses arising from or related to your data, your use of the Service,
                your customer messaging practices, your violation of law, your infringement of rights,
                your misuse of payment or wallet functionality, or your breach of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">15. Changes to These Terms</h2>
              <p className="text-muted-foreground">
                We may revise these Terms from time to time. Material changes may be communicated
                through the Service, by email, or by other reasonable means. Continued use of the
                Service after the effective date of updated Terms constitutes acceptance of the
                revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">16. Governing Law and Dispute Framework</h2>
              <p className="text-muted-foreground">
                These Terms are intended to support Salon Magik’s operations in Nigeria and Ghana.
                The applicable governing law, regulatory handling, and dispute route may depend on
                the relevant contracting entity, user location, transaction context, and mandatory
                local law. To the extent permitted, disputes should first be raised with us for good
                faith resolution before formal proceedings are started. Nothing in these Terms limits
                our right to seek urgent relief, enforce payment obligations, protect intellectual
                property, comply with legal obligations, or respond to regulatory or law-enforcement
                processes in any competent jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">17. Contact</h2>
              <p className="text-muted-foreground">
                Questions about these Terms? Contact{" "}
                <strong>The Gray Avenue LTD</strong> at{" "}
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
