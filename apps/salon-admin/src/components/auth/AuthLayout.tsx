import { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div
      className="flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden"
    >
      {/* ── Left panel (dark purple) ── */}
      <div
        className="flex shrink-0 flex-row items-center justify-between gap-4 px-6 py-5 lg:flex-1 lg:flex-col lg:justify-between lg:px-11 lg:py-11"
        style={{
          background:
            "linear-gradient(160deg, #1F1536 0%, #2E1F4E 60%, #3A2660 100%)",
          backgroundImage:
            "radial-gradient(circle at 85% 10%, rgba(244,200,78,0.10), transparent 45%), linear-gradient(160deg, #1F1536 0%, #2E1F4E 60%, #3A2660 100%)",
        }}
      >
        {/* Logo — bare lemniscate on dark background, no box */}
        <div className="flex items-center gap-2 font-semibold text-white" style={{ fontSize: 19 }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
              stroke="#F4C84E"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="16" cy="16" r="2.1" fill="#ffffff" />
          </svg>
          Salon Magik
        </div>

        {/* Quote + cards — hidden on mobile (compact bar), visible on desktop */}
        <div className="hidden lg:block">
          <blockquote
            className="mb-5 text-white"
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(22px, 2.2vw, 30px)",
              fontWeight: 500,
              lineHeight: 1.22,
              maxWidth: 380,
            }}
          >
            "I stopped losing bookings in WhatsApp the day I switched."
          </blockquote>
          <p className="text-[14px] text-white/50">Salon owner, Accra</p>

          {/* Mini cards */}
          <div className="relative mt-8 h-[140px]">
            {/* Revenue card */}
            <div
              className="absolute rounded-[14px] bg-white px-4 py-4"
              style={{
                width: 200,
                top: 0,
                left: 0,
                transform: "rotate(-5deg)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.32)",
              }}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-black/40">
                This week
              </div>
              <div className="mt-0.5 text-[11px] text-black/50">Booked revenue</div>
              <div
                className="mt-1 text-[22px] text-black"
                style={{ fontFamily: "Fraunces, serif", fontWeight: 500 }}
              >
                ₵4,280
              </div>
            </div>

            {/* Reminder card */}
            <div
              className="absolute rounded-[14px] px-4 py-4"
              style={{
                background: "#F4C84E",
                width: 195,
                top: 28,
                left: 120,
                transform: "rotate(4deg)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.26)",
              }}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-black/50">
                Reminder sent
              </div>
              <div
                className="mt-1 text-[15px] text-black"
                style={{ fontFamily: "Fraunces, serif", fontWeight: 500 }}
              >
                Delivered to Efua
              </div>
            </div>
          </div>
        </div>

        {/* Copyright — hidden on mobile */}
        <p className="hidden text-[12px] text-white/30 lg:block">
          © Salon Magik, a Gray Avenue LTD company
        </p>
      </div>

      {/* ── Right panel (scrollable form) ── */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto bg-[#F8F6F2] px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 28,
                fontWeight: 500,
                letterSpacing: "-0.3px",
                color: "#141014",
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-[14.5px]" style={{ color: "rgba(20,16,20,0.6)" }}>
                {subtitle}
              </p>
            )}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
