import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";

export default function SupportPage() {
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
            <Link to="/support" className="text-[15px] font-medium text-brand-ink">Support</Link>
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
            Support
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-brand-ink/55">
            We're here to help you get the most out of Salon Magik.
          </p>

          {/* Contact cards */}
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <div className="rounded-[18px] border border-brand-ink/8 bg-white p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-brand-lilac-bg">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-brand-purple">
                  <rect x="2" y="4" width="20" height="16" rx="3" />
                  <path d="M2 7l10 7 10-7" />
                </svg>
              </div>
              <h3 className="font-serif text-[18px] font-medium text-brand-ink">Email support</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-brand-ink/55">
                Send us an email and we'll get back to you within 24 hours on business days.
              </p>
              <a
                href="mailto:support@salonmagik.com"
                className="mt-4 block rounded-full border border-brand-purple/30 py-[10px] text-center text-[14px] text-brand-purple transition-colors hover:bg-brand-lilac-bg"
              >
                support@salonmagik.com
              </a>
            </div>

            <div className="rounded-[18px] border border-brand-ink/8 bg-white p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-brand-lilac-bg">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-brand-purple">
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                </svg>
              </div>
              <h3 className="font-serif text-[18px] font-medium text-brand-ink">WhatsApp</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-brand-ink/55">
                Quick questions? Chat with us on WhatsApp during business hours.
              </p>
              <span className="mt-4 block rounded-full border border-brand-ink/10 py-[10px] text-center text-[14px] text-brand-ink/35">
                Coming soon
              </span>
            </div>
          </div>

          {/* Response times */}
          <div className="mt-12">
            <h2 className="mb-5 font-serif text-[22px] font-medium text-brand-ink">Response times</h2>
            <div className="rounded-[14px] bg-brand-lilac-bg px-6 py-5 text-[14px] leading-relaxed text-brand-ink/70 space-y-2">
              <p><span className="font-medium text-brand-ink">Email:</span> Within 24 hours on business days</p>
              <p><span className="font-medium text-brand-ink">WhatsApp:</span> Within 2 hours (9 am – 6 pm WAT, Mon – Fri)</p>
              <p><span className="font-medium text-brand-ink">Urgent:</span> Billing and access issues are always prioritised</p>
            </div>
          </div>

          {/* Before you write */}
          <div className="mt-10">
            <h2 className="mb-5 font-serif text-[22px] font-medium text-brand-ink">Before you write in</h2>
            <ul className="space-y-3 text-[14.5px] text-brand-ink/65">
              {[
                "Check if your question is covered in our FAQ on the pricing page",
                "Make sure you're using an up-to-date browser",
                "Try logging out and back in for odd behaviour",
                "Include your salon name and account email so we can help faster",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-yellow" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-cream-dim px-8 py-8">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4">
          <span className="font-serif text-[18px] font-semibold text-brand-ink">Salon Magik</span>
          <div className="flex gap-6 text-[14px] text-brand-ink/60">
            <Link to="/pricing" className="transition-colors hover:text-brand-ink">Pricing</Link>
            <Link to="/terms" className="transition-colors hover:text-brand-ink">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-brand-ink">Privacy</Link>
          </div>
          <p className="text-[13px] text-brand-ink/40">© {new Date().getFullYear()} Salon Magik</p>
        </div>
      </footer>
    </div>
  );
}
