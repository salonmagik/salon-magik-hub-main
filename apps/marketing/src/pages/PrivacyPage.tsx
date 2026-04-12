import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@ui/button";
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
          <p className="text-muted-foreground mb-8">Last updated: April 12, 2026</p>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-medium mb-3">1. Who We Are</h2>
              <p className="text-muted-foreground">
                Salon Magik is a software product operated by <strong>The Gray Avenue LTD</strong>
                {" "}for beauty and wellness businesses. References in this Privacy Policy to
                {" "}“Salon Magik,” “we,” “us,” or “our” refer to the Salon Magik product and its
                operators, affiliates, and service providers acting on its behalf in Nigeria and
                Ghana. Depending on your location, onboarding flow, contracting path, or operational
                support arrangement, your use of the Service may be administered by The Gray Avenue
                LTD and its related entities, personnel, and contractors supporting Salon Magik.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">2. Scope of This Policy</h2>
              <p className="text-muted-foreground">
                This Privacy Policy applies to information processed through Salon Magik’s websites,
                applications, authentication flows, public booking experiences, customer account
                experiences, support channels, waitlists, market-interest forms, messaging features,
                payment and wallet features, and related business operations. It covers both current
                features and reasonable future product extensions that are compatible with this
                service model.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">3. Information We Collect</h2>
              <p className="text-muted-foreground mb-3">
                We collect and generate different categories of information depending on how you use
                the Service:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Account and identity data, including names, email addresses, phone numbers, passwords, social sign-in data, and authentication metadata.</li>
                <li>Business and tenant data, including business names, branches, service catalogs, schedules, pricing, settings, subscription selections, and billing preferences.</li>
                <li>Staff and role data, including invitations, role assignments, permissions, employment-related workspace records, and activity context.</li>
                <li>Salon-entered customer data, including names, contact details, booking history, appointment notes, preferences, communications, and loyalty or purse balances.</li>
                <li>Booking and appointment data, including scheduled services, products, assigned staff, waitlist activity, cancellations, reschedules, and public booking interactions.</li>
                <li>Payment and transaction data, including subscription records, invoices, payment intents, provider references, wallet or purse balances, withdrawals, refunds, credits, and reconciliation records.</li>
                <li>Messaging data, including email, SMS, WhatsApp, template content, delivery logs, notification preferences, and customer communication history.</li>
                <li>Support and relationship data, including support tickets, onboarding requests, waitlist forms, market-interest submissions, feedback, and correspondence.</li>
                <li>Technical, device, session, audit, and security data, including IP addresses, browser or device metadata, access tokens, login events, audit logs, error logs, and abuse-prevention signals.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">4. How We Collect Information</h2>
              <p className="text-muted-foreground mb-3">
                We collect information:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>directly from you when you create accounts, onboard, connect payment or messaging features, request support, or otherwise use the Service;</li>
                <li>from your authorized staff, teammates, contractors, or salon representatives using your workspace;</li>
                <li>from salon-entered customer records and booking flows that salons configure through the Service;</li>
                <li>from third-party providers such as authentication providers, payment processors, email and messaging providers, hosting providers, and analytics or fraud-prevention tools; and</li>
                <li>automatically through the operation of our websites, applications, APIs, logs, and security systems.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">5. How We Use Information</h2>
              <p className="text-muted-foreground mb-3">
                We use information to operate, secure, and improve Salon Magik, including to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>create, authenticate, verify, secure, and administer accounts and workspaces;</li>
                <li>provision tenants, roles, branches, settings, and onboarding workflows;</li>
                <li>support appointment scheduling, public booking, customer management, staff assignment, and related salon operations;</li>
                <li>process or facilitate payments, subscription billing, wallets, purses, credits, withdrawals, refunds, reconciliation, risk checks, and accounting operations;</li>
                <li>deliver transactional and operational communications by email, SMS, WhatsApp, in-app notifications, or similar channels;</li>
                <li>provide support, investigate incidents, resolve disputes, enforce our policies, and respond to legal or regulatory obligations;</li>
                <li>monitor performance, troubleshoot issues, detect abuse, fraud, unauthorized activity, or security events, and maintain audit trails;</li>
                <li>conduct internal analytics, product planning, service improvement, quality assurance, and business continuity activities; and</li>
                <li>comply with financial, tax, anti-fraud, anti-money laundering, sanctions, legal hold, and other compliance obligations that may apply to us or our service providers.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">6. Our Data Roles</h2>
              <p className="text-muted-foreground mb-3">
                Our role depends on the type of data involved:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>For Salon Magik account, platform, security, commercial, operational, payment, and support data, Salon Magik generally acts as a data controller or equivalent responsible party.</li>
                <li>For customer records, appointment details, communication preferences, and similar data that salons enter or manage using the Service for their own end customers, the salon business is generally the controller, and Salon Magik acts as a processor or service provider on that salon’s behalf.</li>
                <li>We may independently use or retain certain data where necessary to comply with law, enforce our rights, prevent fraud, resolve disputes, secure the platform, or meet payment, accounting, tax, or regulatory obligations.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">7. How We Share Information</h2>
              <p className="text-muted-foreground mb-3">
                We do not sell personal information for third-party advertising. We may disclose
                information:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>to infrastructure, hosting, database, authentication, storage, security, logging, and analytics providers that help operate the Service;</li>
                <li>to payment processors, financial services providers, and fraud or compliance partners involved in billing, payouts, wallet flows, refunds, withdrawals, or transaction monitoring;</li>
                <li>to email, SMS, WhatsApp, support, and communications vendors that send or support operational messages on our behalf or on behalf of salons using the platform;</li>
                <li>to professional advisers, auditors, insurers, banking partners, regulators, law enforcement, courts, or other authorities where reasonably required;</li>
                <li>in connection with corporate restructuring, financing, acquisition, merger, asset sale, insolvency, or similar transaction; and</li>
                <li>with your consent or at your direction.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">8. Cookies, Local Storage, and Similar Technologies</h2>
              <p className="text-muted-foreground">
                We use cookies, local storage, and similar technologies for authentication, session
                continuity, security, routing, preferences, fraud prevention, performance, and
                analytics. We may also use these technologies to remember the last active tenant,
                context, or login preferences. We do not rely on third-party advertising cookies as
                a core feature of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">9. Security</h2>
              <p className="text-muted-foreground">
                We use commercially reasonable technical and organizational measures intended to
                protect information against unauthorized access, loss, misuse, or alteration. These
                measures may include access controls, role-based permissions, encryption in transit,
                logical segregation, logging, monitoring, audit trails, and operational safeguards.
                No system can be guaranteed to be completely secure, and we do not warrant that the
                Service will always be free from interruption, attack, compromise, or human error.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">10. Retention, Closure, and Deactivation</h2>
              <p className="text-muted-foreground mb-3">
                We retain information for as long as reasonably necessary to operate the Service and
                to fulfill legal, financial, security, and compliance obligations. We do not offer a
                general self-serve account deletion feature. Instead, account closure or deactivation
                may be requested or applied subject to our review and obligations.
              </p>
              <p className="text-muted-foreground mb-3">
                Even after closure or deactivation, we may retain or archive data where necessary
                for payment history, transaction reconciliation, anti-fraud and anti-money laundering
                controls, accounting and tax records, audit trails, dispute resolution, legal claims,
                security investigations, backup recovery, sanctions compliance, law-enforcement
                requests, and the integrity of our platform and financial systems.
              </p>
              <p className="text-muted-foreground">
                Where appropriate, we may restrict processing, anonymize, aggregate, or otherwise
                reduce the identifiability of retained data instead of deleting it outright.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">11. Your Rights and Choices</h2>
              <p className="text-muted-foreground mb-3">
                Depending on your location and the nature of our relationship with you, you may have
                rights to request access, correction, restriction, objection, complaint, portability,
                or other legally recognized remedies. These rights are not absolute and may be
                limited by identity verification requirements, confidentiality obligations, legal
                exceptions, and our retention or compliance duties.
              </p>
              <p className="text-muted-foreground">
                If we process salon-entered customer data only on behalf of a salon, requests
                relating to that customer data may need to be directed first to the relevant salon
                as the primary controller of that information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">12. International and Cross-Border Transfers</h2>
              <p className="text-muted-foreground">
                Salon Magik operates across Nigeria and Ghana and may use service providers or
                infrastructure located in other jurisdictions. Your information may therefore be
                accessed, stored, processed, or transferred outside your home jurisdiction. Where
                required, we seek to use appropriate safeguards, contractual protections, operational
                controls, or lawful transfer mechanisms suitable for the circumstances.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">13. Children's Privacy</h2>
              <p className="text-muted-foreground">
                The Service is designed for business users and is not directed to children. We do
                not knowingly market the Service to children or intentionally collect information
                directly from children in contexts where parental or legal authorization would be
                required. If you believe information involving a child has been provided to us in a
                way that raises legal concerns, contact us promptly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">14. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may revise this Privacy Policy from time to time to reflect changes to the
                Service, our operations, law, regulatory guidance, security practices, or provider
                relationships. Material changes may be communicated through the Service, by email,
                or by other reasonable means. The “Last updated” date indicates the latest revision.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-3">15. Contact Us</h2>
              <p className="text-muted-foreground mb-3">
                For privacy questions, data requests, or legal notices relating to Salon Magik,
                contact:
              </p>
              <p className="text-muted-foreground">
                <strong>The Gray Avenue LTD</strong>
                <br />
                Operating in Nigeria and Ghana
                <br />
                Email:{" "}
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
