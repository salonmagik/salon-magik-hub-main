import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9 first:mt-0">
      <h2 className="mb-3 font-serif text-[19px] font-medium text-brand-ink">{title}</h2>
      {children}
    </section>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-brand-ink/65">{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-brand-ink/65">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-yellow" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-brand-cream">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-brand-cream">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-[18px]">
          <Link to="/">
            <SalonMagikLogo size="md" />
          </Link>
          <div className="hidden items-center gap-9 md:flex">
            <Link to="/pricing" className="text-[15px] text-brand-ink/70 transition-colors hover:text-brand-ink">Pricing</Link>
            <Link to="/support" className="text-[15px] text-brand-ink/70 transition-colors hover:text-brand-ink">Support</Link>
          </div>
          <a
            href="https://app.salonmagik.com/login"
            className="rounded-full bg-brand-ink px-[22px] py-[11px] text-[14.5px] text-white transition-colors hover:bg-brand-purple"
          >
            Log in
          </a>
        </div>
      </nav>

      {/* Content */}
      <section className="px-8 py-16">
        <div className="mx-auto max-w-[720px]">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-1.5 text-[14px] text-brand-ink/50 transition-colors hover:text-brand-ink"
          >
            ← Back to home
          </Link>

          <h1 className="font-serif text-[clamp(32px,4vw,44px)] font-medium leading-[1.12] tracking-[-0.4px] text-brand-ink">
            Privacy Policy
          </h1>
          <p className="mt-3 text-[14px] text-brand-ink/40">Last updated: April 12, 2026</p>

          <div className="mt-10">
            <Section title="1. Who We Are">
              <Prose>
                Salon Magik is a software product operated by{" "}
                <strong className="text-brand-ink">The Gray Avenue LTD</strong> for beauty and
                wellness businesses. References in this Privacy Policy to "Salon Magik," "we,"
                "us," or "our" refer to the Salon Magik product and its operators, affiliates, and
                service providers acting on its behalf in Nigeria and Ghana. Depending on your
                location, onboarding flow, contracting path, or operational support arrangement,
                your use of the Service may be administered by The Gray Avenue LTD and its related
                entities, personnel, and contractors supporting Salon Magik.
              </Prose>
            </Section>

            <Section title="2. Scope of This Policy">
              <Prose>
                This Privacy Policy applies to information processed through Salon Magik's websites,
                applications, authentication flows, public booking experiences, customer account
                experiences, support channels, waitlists, market-interest forms, messaging features,
                payment and wallet features, and related business operations. It covers both current
                features and reasonable future product extensions that are compatible with this
                service model.
              </Prose>
            </Section>

            <Section title="3. Information We Collect">
              <Prose>We collect and generate different categories of information depending on how you use the Service:</Prose>
              <List items={[
                "Account and identity data, including names, email addresses, phone numbers, passwords, social sign-in data, and authentication metadata.",
                "Business and tenant data, including business names, branches, service catalogs, schedules, pricing, settings, subscription selections, and billing preferences.",
                "Staff and role data, including invitations, role assignments, permissions, employment-related workspace records, and activity context.",
                "Salon-entered customer data, including names, contact details, booking history, appointment notes, preferences, communications, and loyalty or purse balances.",
                "Booking and appointment data, including scheduled services, products, assigned staff, waitlist activity, cancellations, reschedules, and public booking interactions.",
                "Payment and transaction data, including subscription records, invoices, payment intents, provider references, wallet or purse balances, withdrawals, refunds, credits, and reconciliation records.",
                "Messaging data, including email, SMS, WhatsApp, template content, delivery logs, notification preferences, and customer communication history.",
                "Support and relationship data, including support tickets, onboarding requests, waitlist forms, market-interest submissions, feedback, and correspondence.",
                "Technical, device, session, audit, and security data, including IP addresses, browser or device metadata, access tokens, login events, audit logs, error logs, and abuse-prevention signals.",
              ]} />
            </Section>

            <Section title="4. How We Collect Information">
              <Prose>We collect information:</Prose>
              <List items={[
                "directly from you when you create accounts, onboard, connect payment or messaging features, request support, or otherwise use the Service;",
                "from your authorized staff, teammates, contractors, or salon representatives using your workspace;",
                "from salon-entered customer records and booking flows that salons configure through the Service;",
                "from third-party providers such as authentication providers, payment processors, email and messaging providers, hosting providers, and analytics or fraud-prevention tools; and",
                "automatically through the operation of our websites, applications, APIs, logs, and security systems.",
              ]} />
            </Section>

            <Section title="5. How We Use Information">
              <Prose>We use information to operate, secure, and improve Salon Magik, including to:</Prose>
              <List items={[
                "create, authenticate, verify, secure, and administer accounts and workspaces;",
                "provision tenants, roles, branches, settings, and onboarding workflows;",
                "support appointment scheduling, public booking, customer management, staff assignment, and related salon operations;",
                "process or facilitate payments, subscription billing, wallets, purses, credits, withdrawals, refunds, reconciliation, risk checks, and accounting operations;",
                "deliver transactional and operational communications by email, SMS, WhatsApp, in-app notifications, or similar channels;",
                "provide support, investigate incidents, resolve disputes, enforce our policies, and respond to legal or regulatory obligations;",
                "monitor performance, troubleshoot issues, detect abuse, fraud, unauthorized activity, or security events, and maintain audit trails;",
                "conduct internal analytics, product planning, service improvement, quality assurance, and business continuity activities; and",
                "comply with financial, tax, anti-fraud, anti-money laundering, sanctions, legal hold, and other compliance obligations that may apply to us or our service providers.",
              ]} />
            </Section>

            <Section title="6. Our Data Roles">
              <List items={[
                "For Salon Magik account, platform, security, commercial, operational, payment, and support data, Salon Magik generally acts as a data controller or equivalent responsible party.",
                "For customer records, appointment details, communication preferences, and similar data that salons enter or manage using the Service for their own end customers, the salon business is generally the controller, and Salon Magik acts as a processor or service provider on that salon's behalf.",
                "We may independently use or retain certain data where necessary to comply with law, enforce our rights, prevent fraud, resolve disputes, secure the platform, or meet payment, accounting, tax, or regulatory obligations.",
              ]} />
            </Section>

            <Section title="7. How We Share Information">
              <Prose>We do not sell personal information for third-party advertising. We may disclose information:</Prose>
              <List items={[
                "to infrastructure, hosting, database, authentication, storage, security, logging, and analytics providers that help operate the Service;",
                "to payment processors, financial services providers, and fraud or compliance partners involved in billing, payouts, wallet flows, refunds, withdrawals, or transaction monitoring;",
                "to email, SMS, WhatsApp, support, and communications vendors that send or support operational messages on our behalf or on behalf of salons using the platform;",
                "to professional advisers, auditors, insurers, banking partners, regulators, law enforcement, courts, or other authorities where reasonably required;",
                "in connection with corporate restructuring, financing, acquisition, merger, asset sale, insolvency, or similar transaction; and",
                "with your consent or at your direction.",
              ]} />
            </Section>

            <Section title="8. Cookies, Local Storage, and Similar Technologies">
              <Prose>
                We use cookies, local storage, and similar technologies for authentication, session
                continuity, security, routing, preferences, fraud prevention, performance, and
                analytics. We may also use these technologies to remember the last active tenant,
                context, or login preferences. We do not rely on third-party advertising cookies as
                a core feature of the Service.
              </Prose>
            </Section>

            <Section title="9. Security">
              <Prose>
                We use commercially reasonable technical and organizational measures intended to
                protect information against unauthorized access, loss, misuse, or alteration. These
                measures may include access controls, role-based permissions, encryption in transit,
                logical segregation, logging, monitoring, audit trails, and operational safeguards.
                No system can be guaranteed to be completely secure, and we do not warrant that the
                Service will always be free from interruption, attack, compromise, or human error.
              </Prose>
            </Section>

            <Section title="10. Retention, Closure, and Deactivation">
              <Prose>
                We retain information for as long as reasonably necessary to operate the Service and
                to fulfill legal, financial, security, and compliance obligations. We do not offer a
                general self-serve account deletion feature. Account closure or deactivation may be
                requested or applied subject to our review and obligations. Even after closure, we
                may retain data where necessary for payment history, transaction reconciliation,
                anti-fraud controls, accounting and tax records, audit trails, dispute resolution,
                legal claims, security investigations, backup recovery, sanctions compliance, and
                law-enforcement requests.
              </Prose>
            </Section>

            <Section title="11. Your Rights and Choices">
              <Prose>
                Depending on your location and the nature of our relationship with you, you may have
                rights to request access, correction, restriction, objection, complaint, portability,
                or other legally recognized remedies. These rights are not absolute and may be
                limited by identity verification requirements, confidentiality obligations, legal
                exceptions, and our retention or compliance duties. If we process salon-entered
                customer data only on behalf of a salon, requests relating to that customer data may
                need to be directed first to the relevant salon as the primary controller of that
                information.
              </Prose>
            </Section>

            <Section title="12. International and Cross-Border Transfers">
              <Prose>
                Salon Magik operates across Nigeria and Ghana and may use service providers or
                infrastructure located in other jurisdictions. Your information may therefore be
                accessed, stored, processed, or transferred outside your home jurisdiction. Where
                required, we seek to use appropriate safeguards, contractual protections, operational
                controls, or lawful transfer mechanisms suitable for the circumstances.
              </Prose>
            </Section>

            <Section title="13. Children's Privacy">
              <Prose>
                The Service is designed for business users and is not directed to children. We do
                not knowingly market the Service to children or intentionally collect information
                directly from children in contexts where parental or legal authorization would be
                required. If you believe information involving a child has been provided to us in a
                way that raises legal concerns, contact us promptly.
              </Prose>
            </Section>

            <Section title="14. Changes to This Policy">
              <Prose>
                We may revise this Privacy Policy from time to time to reflect changes to the
                Service, our operations, law, regulatory guidance, security practices, or provider
                relationships. Material changes may be communicated through the Service, by email,
                or by other reasonable means.
              </Prose>
            </Section>

            <Section title="15. Contact Us">
              <Prose>
                For privacy questions, data requests, or legal notices relating to Salon Magik,
                contact <strong className="text-brand-ink">The Gray Avenue LTD</strong> — operating
                in Nigeria and Ghana — at{" "}
                <a href="mailto:privacy@salonmagik.com" className="text-brand-purple hover:underline">
                  privacy@salonmagik.com
                </a>
              </Prose>
            </Section>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-cream-dim px-8 py-8">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4">
          <span className="font-serif text-[18px] font-semibold text-brand-ink">Salon Magik</span>
          <div className="flex gap-6 text-[14px] text-brand-ink/60">
            <Link to="/pricing" className="transition-colors hover:text-brand-ink">Pricing</Link>
            <Link to="/support" className="transition-colors hover:text-brand-ink">Support</Link>
            <Link to="/terms" className="transition-colors hover:text-brand-ink">Terms</Link>
          </div>
          <p className="text-[13px] text-brand-ink/40">© {new Date().getFullYear()} Salon Magik</p>
        </div>
      </footer>
    </div>
  );
}
