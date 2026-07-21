import { Link } from "react-router-dom";

interface LandingNavProps {
  isWaitlistMode: boolean;
  isLoading: boolean;
  onWaitlistClick?: () => void;
}

export function LandingNav({ isWaitlistMode, isLoading, onWaitlistClick }: LandingNavProps) {
  const defaultSalonAppUrl = import.meta.env.DEV ? "http://localhost:8080" : "https://app.salonmagik.com";
  const salonAppUrl = (import.meta.env.VITE_SALON_APP_URL || defaultSalonAppUrl).replace(/\/$/, "");

  return (
    <nav className="sticky top-0 z-50 bg-brand-cream">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-[18px]">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] bg-brand-purple">
            <svg width="15" height="15" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
                stroke="#F4C84E"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle cx="16" cy="16" r="2.3" fill="#fff" />
            </svg>
          </span>
          <span className="font-sans text-[19px] font-semibold tracking-[0.2px] text-brand-ink">
            Salon Magik
          </span>
        </div>

        {/* Nav links — hidden on mobile */}
        <div className="hidden items-center gap-9 md:flex">
          <Link to="/pricing" className="text-[15px] text-brand-ink/70 transition-colors hover:text-brand-ink">Pricing</Link>
          <Link to="/faq" className="text-[15px] text-brand-ink/70 transition-colors hover:text-brand-ink">FAQ</Link>
          <Link to="/support" className="text-[15px] text-brand-ink/70 transition-colors hover:text-brand-ink">Support</Link>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-5">
          {!isLoading && !isWaitlistMode && (
            <>
              <a
                href={`${salonAppUrl}/login`}
                className="hidden text-[15px] text-brand-ink transition-colors hover:text-brand-purple md:block"
              >
                Log in
              </a>
              <a
                href={`${salonAppUrl}/signup`}
                className="rounded-full bg-brand-ink px-[22px] py-[11px] text-[14.5px] text-white transition-colors hover:bg-brand-purple"
              >
                Start free
              </a>
            </>
          )}
          {!isLoading && isWaitlistMode && (
            <button
              type="button"
              onClick={onWaitlistClick}
              className="rounded-full bg-brand-ink px-[22px] py-[11px] text-[14.5px] text-white transition-colors hover:bg-brand-purple"
            >
              Exclusive access
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
