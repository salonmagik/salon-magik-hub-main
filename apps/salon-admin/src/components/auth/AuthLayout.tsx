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
    quote: "Every appointment, every client, every payment — all in one place.",
    card1: { label: "Today's schedule", value: "Ready to view" },
    card2: { label: "Client records", value: "All up to date" },
  },
  {
    quote: "Your reminders went out. Your clients are ready. Your business runs.",
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
        className="flex shrink-0 flex-row items-center justify-between gap-4 px-6 py-5 lg:flex-1 lg:flex-col lg:items-start lg:justify-between lg:px-11 lg:py-11"
        style={{
          background:
            "linear-gradient(160deg, #1F1536 0%, #2E1F4E 60%, #3A2660 100%)",
          backgroundImage:
            "radial-gradient(circle at 85% 10%, rgba(244,200,78,0.10), transparent 45%), linear-gradient(160deg, #1F1536 0%, #2E1F4E 60%, #3A2660 100%)",
        }}
      >
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
              fontFamily: "Fraunces, serif",
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
              <div
                className="mt-1 text-[20px] text-black"
                style={{ fontFamily: "Fraunces, serif", fontWeight: 500 }}
              >
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
              <div
                className="mt-1 text-[18px] text-black"
                style={{ fontFamily: "Fraunces, serif", fontWeight: 500 }}
              >
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
