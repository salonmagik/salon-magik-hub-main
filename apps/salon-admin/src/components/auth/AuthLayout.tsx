import { ReactNode, useEffect, useState } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  variant?: "login" | "signup";
}

const SIGNUP_SLIDES = [
  {
    quote: "I stopped getting no-shows the week I turned on SMS reminders.",
    name: "Kemi A.",
    location: "Lagos",
    card1: { label: "Reminders sent", value: "Delivered overnight" },
    card2: { label: "No-shows this week", value: "0" },
  },
  {
    quote: "Clients book themselves now. I don't even pick up the phone for appointments anymore.",
    name: "Efua M.",
    location: "Accra",
    card1: { label: "Bookings today", value: "Via booking link" },
    card2: { label: "Calls for bookings", value: "Zero" },
  },
  {
    quote: "Knowing exactly what I earned this month used to take hours. Now it's just the dashboard.",
    name: "Tolu O.",
    location: "Ibadan",
    card1: { label: "This month", value: "₦85,400" },
    card2: { label: "Time to reconcile", value: "2 minutes" },
  },
];

const LOGIN_SLIDES = [
  {
    quote: "Your booking page is live 24/7. Clients can book while you sleep.",
    card1: { label: "Booking page", value: "Live now" },
    card2: { label: "Last booking", value: "2 hours ago" },
  },
  {
    quote: "Every appointment, every client, every payment. All in one place.",
    card1: { label: "Today's schedule", value: "Ready to view" },
    card2: { label: "Client records", value: "All up to date" },
  },
  {
    quote: "Your reminders went out. Your clients are ready. Your business is winning.",
    card1: { label: "Reminders sent", value: "Delivered" },
    card2: { label: "Revenue tracked", value: "This week" },
  },
];

export function AuthLayout({ children, title, subtitle, variant = "signup" }: AuthLayoutProps) {
  const [idx, setIdx] = useState(0);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % 3);
      setKey((k) => k + 1);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const slides = variant === "login" ? LOGIN_SLIDES : SIGNUP_SLIDES;
  const slide = slides[idx];

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* ── Left panel (dark purple) ── */}
      <div
        className="relative flex shrink-0 flex-row items-center justify-between gap-4 overflow-hidden px-6 py-5 lg:flex-1 lg:flex-col lg:items-start lg:justify-between lg:px-11 lg:py-11"
        style={{
          background:
            "linear-gradient(160deg, #1F1536 0%, #2E1F4E 60%, #3A2660 100%)",
          backgroundImage:
            "radial-gradient(circle at 85% 10%, rgba(244,200,78,0.10), transparent 45%), linear-gradient(160deg, #1F1536 0%, #2E1F4E 60%, #3A2660 100%)",
        }}
      >
        {/* Decorative scattered salon icons */}
        <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
          {/* Scissors — top right */}
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "8%", right: "10%", opacity: 0.12, transform: "rotate(18deg)" }}>
            <circle cx="8" cy="22" r="4.5" stroke="white" strokeWidth="2" />
            <circle cx="8" cy="10" r="4.5" stroke="white" strokeWidth="2" />
            <line x1="11.5" y1="19.5" x2="27" y2="7" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="11.5" y1="12.5" x2="27" y2="25" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          {/* Nail polish — bottom left */}
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ bottom: "16%", left: "8%", opacity: 0.10, transform: "rotate(-12deg)" }}>
            <rect x="11" y="3" width="10" height="7" rx="2" stroke="white" strokeWidth="2" />
            <line x1="16" y1="7" x2="16" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M11 10 Q9 12 9 15 L9 26 Q9 29 16 29 Q23 29 23 26 L23 15 Q23 12 21 10 Z" stroke="white" strokeWidth="2" />
          </svg>
          {/* Mirror — mid left */}
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "42%", left: "5%", opacity: 0.09, transform: "rotate(8deg)" }}>
            <ellipse cx="16" cy="12" rx="9" ry="10" stroke="white" strokeWidth="2" />
            <line x1="16" y1="22" x2="16" y2="29" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="11" y1="29" x2="21" y2="29" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {/* Blow dryer — bottom right */}
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="absolute" style={{ bottom: "8%", right: "8%", opacity: 0.11, transform: "rotate(-20deg)" }}>
            <ellipse cx="13" cy="13" rx="9" ry="7" stroke="white" strokeWidth="2" />
            <path d="M21 10 L27 8 L27 18 L21 16" stroke="white" strokeWidth="2" strokeLinejoin="round" />
            <path d="M9 19 Q7 23 7 27" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {/* Comb — top left */}
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "22%", left: "6%", opacity: 0.08, transform: "rotate(-30deg)" }}>
            <rect x="3" y="8" width="26" height="8" rx="2" stroke="white" strokeWidth="2" />
            {[7, 11, 15, 19, 23].map((x) => (
              <line key={x} x1={x} y1="16" x2={x} y2="25" stroke="white" strokeWidth="2" strokeLinecap="round" />
            ))}
          </svg>
          {/* Scissors small — mid right */}
          <svg width="15" height="15" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "65%", right: "6%", opacity: 0.08, transform: "rotate(40deg)" }}>
            <circle cx="8" cy="22" r="4.5" stroke="white" strokeWidth="2" />
            <circle cx="8" cy="10" r="4.5" stroke="white" strokeWidth="2" />
            <line x1="11.5" y1="19.5" x2="27" y2="7" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="11.5" y1="12.5" x2="27" y2="25" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        {/* Logo */}
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

        {/* Cycling content — hidden on mobile (compact bar), visible on desktop */}
        <div className="hidden lg:block" key={key} style={{ animation: "authFadeIn 0.55s ease-out" }}>
          <blockquote
            className="mb-5 text-white"
            style={{
              fontFamily: "Questrial, serif",
              fontSize: "clamp(20px, 2vw, 26px)",
              fontWeight: 500,
              lineHeight: 1.28,
              maxWidth: 360,
            }}
          >
            "{slide.quote}"
          </blockquote>
          {variant === "signup" && "name" in slide && (
            <p className="text-[14px] text-white/50">
              {(slide as typeof SIGNUP_SLIDES[0]).name} · {(slide as typeof SIGNUP_SLIDES[0]).location}
            </p>
          )}

          {/* Mini cards */}
          <div className="relative mt-8 h-[130px]">
            <div
              className="absolute rounded-[14px] bg-white px-4 py-4"
              style={{
                width: 195,
                top: 0,
                left: 0,
                transform: "rotate(-5deg)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.32)",
              }}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-black/40">
                {slide.card1.label}
              </div>
              <div className="mt-1 text-[20px] font-semibold text-black">
                {slide.card1.value}
              </div>
            </div>

            <div
              className="absolute rounded-[14px] px-4 py-4"
              style={{
                background: "#F4C84E",
                width: 185,
                top: 28,
                left: 115,
                transform: "rotate(4deg)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.26)",
              }}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-black/50">
                {slide.card2.label}
              </div>
              <div className="mt-1 text-[18px] font-semibold text-black">
                {slide.card2.value}
              </div>
            </div>
          </div>
        </div>

        {/* Copyright — hidden on mobile */}
        <p className="hidden text-[12px] text-white/30 lg:block">
          © Salon Magik, a product of The Gray Avenue LTD
        </p>
      </div>

      {/* ── Right panel (scrollable form) ── */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto bg-[#F8F6F2] px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1
              style={{
                fontSize: 28,
                fontWeight: 600,
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
