import { Link } from "react-router-dom";

/* Five recognizable salon SVG icons for the morph animation */
function ScissorsIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <circle cx="8" cy="22" r="4.5" stroke="#F4C84E" strokeWidth="2" />
      <circle cx="8" cy="10" r="4.5" stroke="#F4C84E" strokeWidth="2" />
      <line x1="11.5" y1="19.5" x2="27" y2="7" stroke="#F4C84E" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="11.5" y1="12.5" x2="27" y2="25" stroke="#F4C84E" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CombIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <rect x="3" y="8" width="26" height="8" rx="2" stroke="#F4C84E" strokeWidth="2" />
      {[7, 11, 15, 19, 23].map((x) => (
        <line key={x} x1={x} y1="16" x2={x} y2="25" stroke="#F4C84E" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  );
}

function BlowDryerIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <ellipse cx="13" cy="13" rx="9" ry="7" stroke="#F4C84E" strokeWidth="2" />
      <path d="M21 10 L27 8 L27 18 L21 16" stroke="#F4C84E" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 19 Q7 23 7 27" stroke="#F4C84E" strokeWidth="2" strokeLinecap="round" />
      <circle cx="29.5" cy="11" r="1" fill="#F4C84E" />
      <circle cx="30.5" cy="14" r="1" fill="#F4C84E" />
      <circle cx="29.5" cy="17" r="1" fill="#F4C84E" />
    </svg>
  );
}

function MirrorIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <ellipse cx="16" cy="12" rx="9" ry="10" stroke="#F4C84E" strokeWidth="2" />
      <line x1="16" y1="22" x2="16" y2="29" stroke="#F4C84E" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="11" y1="29" x2="21" y2="29" stroke="#F4C84E" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NailPolishIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <rect x="11" y="3" width="10" height="7" rx="2" stroke="#F4C84E" strokeWidth="2" />
      <line x1="16" y1="7" x2="16" y2="11" stroke="#F4C84E" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 10 Q9 12 9 15 L9 26 Q9 29 16 29 Q23 29 23 26 L23 15 Q23 12 21 10 Z" stroke="#F4C84E" strokeWidth="2" />
    </svg>
  );
}

const morphIcons = [ScissorsIcon, CombIcon, BlowDryerIcon, MirrorIcon, NailPolishIcon];

export function LandingFooter() {
  return (
    <footer className="bg-brand-purple-deep text-white/60">
      <div className="mx-auto max-w-[1180px] px-8">

        {/* Morph moment */}
        <div className="border-b border-white/5 pt-[56px] pb-[48px] text-center">
          {/* Cycling icon */}
          <div className="relative mx-auto mb-8 h-[84px] w-[84px]">
            {morphIcons.map((Icon, i) => (
              <div key={i} className="morph-icon">
                <Icon />
              </div>
            ))}
          </div>

          {/* Large wordmark */}
          <div
            className="font-questrial text-[clamp(48px,9vw,108px)] font-medium leading-none"
            style={{
              background: "linear-gradient(180deg, #ffffff 0%, #B8A9D9 55%, #F4C84E 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Salon Magik
          </div>
          <p className="mt-[18px] text-[14px] text-white/45">
            Bookings, staff, payments and messaging, all in one place.
          </p>
        </div>

        {/* Links */}
        <div className="grid grid-cols-2 gap-10 pb-[50px] pt-[50px] sm:grid-cols-[1.6fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-1">
            <div className="mb-3.5 flex items-center gap-2 font-questrial text-[20px] text-white">
              <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
                    stroke="#F4C84E"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="16" cy="16" r="2.1" fill="#fff" />
                </svg>
              </span>
              Salon Magik
            </div>
            <p className="max-w-[260px] text-[13.5px] leading-relaxed text-white/60">
              The booking and business management platform built specifically for African beauty professionals.
            </p>
          </div>

          <div>
            <h5 className="mb-4 text-[12.5px] uppercase tracking-[0.06em] text-white/40">Product</h5>
            <Link to="/pricing" className="mb-3 block text-[14px] text-white/68 transition-colors hover:text-brand-yellow">
              Pricing
            </Link>
            <Link to="/support" className="block text-[14px] text-white/68 transition-colors hover:text-brand-yellow">
              Support
            </Link>
          </div>

          <div>
            <h5 className="mb-4 text-[12.5px] uppercase tracking-[0.06em] text-white/40">Legal</h5>
            <Link to="/terms" className="mb-3 block text-[14px] text-white/68 transition-colors hover:text-brand-yellow">
              Terms of Service
            </Link>
            <Link to="/privacy" className="block text-[14px] text-white/68 transition-colors hover:text-brand-yellow">
              Privacy Policy
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-white/5 py-[26px] text-[12.5px]">
          <span>&copy; Salon Magik, a product of The Gray Avenue LTD</span>
        </div>
      </div>
    </footer>
  );
}
