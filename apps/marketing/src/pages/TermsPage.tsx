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

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-3 text-[14px] text-brand-ink/40">Last updated: April 12, 2026</p>

          <div className="mt-10">
            <Section title="1. Acceptance of These Terms">
              <Prose>
                These Terms of Service govern access to and use of Salon Magik. By accessing,
                registering for, connecting to, or using the Service, you agree to be bound by
                these Terms. If you are using the Service on behalf of a business, salon, chain,
                branch group, or other organization, you represent that you have authority to bind
                that organization and its authorized users to these Terms.
              </Prose>
            </Section>

            <Section title="2. Contracting Party and Service Operator">
              <Prose>
                Salon Magik is a product of <strong className="text-brand-ink">The Gray Avenue LTD</strong>. References to
                "Salon Magik," "we," "us," or "our" refer to the Salon Magik product and The
                Gray Avenue LTD, including related entities, affiliates, contractors, service
                providers, and operational support structures involved in providing the Service in
                Nigeria and Ghana. We may provide parts of the Service through affiliates, partners,
                or third-party infrastructure while remaining responsible for the contractual service
                relationship unless expressly stated otherwise.
              </Prose>
            </Section>

            <Section title="3. Description of the Service">
              <Prose>
                Salon Magik provides software and related infrastructure for beauty and wellness
                businesses, including booking management, customer records, messaging, staff and
                branch administration, reporting, billing, payment-related workflows, wallet or purse
                features, withdrawals, refunds, authentication, public booking experiences, and
                related business tools. Features may change over time, may vary by environment or
                region, and may be introduced, modified, suspended, or discontinued at our
                discretion.
              </Prose>
            </Section>

            <Section title="4. Eligibility, Accounts, and Security">
              <List items={[
                "You must provide accurate, current, and complete information when registering and using the Service.",
                "You are responsible for safeguarding credentials, authenticators, devices, and any access granted to your account or workspace.",
                "You are responsible for activities carried out under your account, tenant, or workspace by your employees, contractors, invited staff, administrators, and other authorized users.",
                "We may support password, OTP, social sign-in, and invitation-based access flows. Third-party authentication providers are outside our control and may impose separate terms or availability constraints.",
                "We may require password changes, step-up verification, re-authentication, or account review for security, onboarding, provider, or compliance reasons.",
              ]} />
            </Section>

            <Section title="5. Customer Data and User Responsibilities">
              <List items={[
                "You retain responsibility for the accuracy, lawfulness, and integrity of data you or your users upload, create, or manage through the Service.",
                "You must have a lawful basis to collect, use, message, store, and otherwise process customer and staff data in the Service.",
                "You are responsible for obtaining any notices, consents, permissions, or approvals required for email, SMS, WhatsApp, booking, marketing, support, or other customer communications you send through the platform.",
                "You remain responsible for configuring staff roles, permissions, and workspace access appropriately.",
                "You must not use the Service to store or process data in a manner that violates law, professional obligations, third-party rights, or industry-specific requirements applicable to you.",
              ]} />
            </Section>

            <Section title="6. Payments, Wallets, Purses, Credits, Refunds, and Withdrawals">
              <List items={[
                "Payment, subscription, credit, purse, wallet, refund, and withdrawal features may depend on third-party providers and may be subject to additional checks, holds, reversals, fees, delays, restrictions, or provider failures.",
                "We may delay, reject, reverse, suspend, limit, investigate, or request additional verification for transactions where reasonably necessary for fraud prevention, anti-money laundering, sanctions compliance, dispute management, reconciliation, chargeback risk, legal obligations, or platform integrity.",
                "Displayed balances, credits, wallet values, transaction statuses, and payout timelines may be provisional until confirmed through internal controls and external provider reconciliation.",
                "Fees are generally non-refundable except where required by law or expressly stated otherwise by us in writing.",
                "We do not guarantee uninterrupted payment availability, payout completion, processor uptime, currency support, or provider approval.",
              ]} />
            </Section>

            <Section title="7. Acceptable Use">
              <Prose>You must not, and must not permit others to:</Prose>
              <List items={[
                "use the Service for unlawful, fraudulent, abusive, deceptive, harassing, or infringing purposes;",
                "send spam, unauthorized marketing, or prohibited messaging through any channel;",
                "attempt unauthorized access, privilege escalation, credential sharing beyond authorized use, or circumvention of security controls;",
                "reverse engineer, scrape, disrupt, overload, or interfere with the Service or connected systems except where law expressly prohibits such restriction;",
                "misrepresent identity, business status, payment status, or authority to act on behalf of another person or business; or",
                "use the Service in a way that exposes us, our providers, or other users to regulatory, sanctions, financial crime, reputational, or legal risk.",
              ]} />
            </Section>

            <Section title="8. Privacy and Data Handling">
              <Prose>
                Our handling of information is described in our{" "}
                <Link to="/privacy" className="text-brand-purple hover:underline">Privacy Policy</Link>.
                As between us and the salon or business customer, Salon Magik generally acts as
                controller for its own account, billing, platform, security, and operational data,
                while the salon is generally responsible as controller for its own end-customer data
                entered into the Service. You agree to comply with your own privacy, messaging,
                consumer, employment, tax, financial, and sector-specific obligations.
              </Prose>
            </Section>

            <Section title="9. Suspension, Restriction, and Termination">
              <Prose>
                We may suspend, restrict, condition, or terminate access to all or part of the
                Service immediately or over time if we reasonably believe there is a breach of these
                Terms, fraud risk, security concern, non-payment, sanctions or compliance issue,
                provider requirement, legal compulsion, dispute risk, operational abuse, or material
                harm to us, our users, or third parties. We may also discontinue features, regions,
                or integrations in whole or in part.
              </Prose>
            </Section>

            <Section title="10. Account Closure, Deactivation, and Retention">
              <Prose>
                We do not provide a general self-serve account deletion mechanism. Accounts may be
                closed or deactivated by request or by us in accordance with these Terms and our
                legal, financial, fraud-prevention, security, audit, accounting, and compliance
                obligations. Following closure or deactivation, we may retain transaction history,
                audit logs, payout and refund records, billing records, identity verification records,
                security data, dispute records, regulatory logs, backups, and other records required
                to protect the platform, comply with law, or preserve evidence.
              </Prose>
            </Section>

            <Section title="11. Intellectual Property and Feedback">
              <Prose>
                You retain rights in data you lawfully provide to the Service. We retain all rights
                in the Service itself, including the software, branding, interfaces, workflows,
                templates, documentation, and related intellectual property. Subject to these Terms,
                we grant you a limited, revocable, non-exclusive, non-transferable right to use the
                Service for your internal business purposes. If you provide feedback, ideas, or
                suggestions, you grant us the right to use them without restriction or compensation.
              </Prose>
            </Section>

            <Section title="12. Warranties and Disclaimers">
              <Prose>
                The Service is provided on an "as available" and "as is" basis. To the fullest
                extent permitted by law, we disclaim warranties of merchantability, fitness for a
                particular purpose, title, non-infringement, uninterrupted availability, error-free
                operation, or guaranteed compatibility with third-party systems, processors, devices,
                carriers, or network conditions.
              </Prose>
            </Section>

            <Section title="13. Limitation of Liability">
              <Prose>
                To the fullest extent permitted by law, we will not be liable for indirect,
                incidental, special, consequential, exemplary, punitive, or loss-of-profit damages,
                or for loss of data, goodwill, customers, business opportunity, or anticipated
                savings arising from or related to the Service. Our aggregate liability arising out
                of or relating to the Service will be limited to the amounts paid by you to us for
                the Service during the twelve months preceding the event giving rise to the claim,
                except to the extent a greater limitation is prohibited by applicable law.
              </Prose>
            </Section>

            <Section title="14. Indemnity">
              <Prose>
                You agree to defend, indemnify, and hold harmless Salon Magik, The Gray Avenue LTD,
                their affiliates, personnel, and service providers from claims, liabilities, losses,
                costs, and expenses arising from or related to your data, your use of the Service,
                your customer messaging practices, your violation of law, your infringement of rights,
                your misuse of payment or wallet functionality, or your breach of these Terms.
              </Prose>
            </Section>

            <Section title="15. Changes to These Terms">
              <Prose>
                We may revise these Terms from time to time. Material changes may be communicated
                through the Service, by email, or by other reasonable means. Continued use of the
                Service after the effective date of updated Terms constitutes acceptance of the
                revised Terms.
              </Prose>
            </Section>

            <Section title="16. Governing Law and Dispute Framework">
              <Prose>
                These Terms are intended to support Salon Magik's operations in Nigeria and Ghana.
                The applicable governing law, regulatory handling, and dispute route may depend on
                the relevant contracting entity, user location, transaction context, and mandatory
                local law. To the extent permitted, disputes should first be raised with us for good
                faith resolution before formal proceedings are started.
              </Prose>
            </Section>

            <Section title="17. Contact">
              <Prose>
                Questions about these Terms? Contact{" "}
                <strong className="text-brand-ink">The Gray Avenue LTD</strong> at{" "}
                <a href="mailto:legal@salonmagik.com" className="text-brand-purple hover:underline">
                  legal@salonmagik.com
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
            <Link to="/privacy" className="transition-colors hover:text-brand-ink">Privacy</Link>
          </div>
          <p className="text-[13px] text-brand-ink/40">© {new Date().getFullYear()} Salon Magik</p>
        </div>
      </footer>
    </div>
  );
}
