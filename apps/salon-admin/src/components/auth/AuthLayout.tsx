import { ReactNode } from "react";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden px-12 py-10 lg:flex lg:w-[44%]"
        style={{ background: "linear-gradient(160deg, #1F1536 0%, #2E1F4E 60%, #3A2660 100%)" }}
      >
        {/* Logo */}
        <SalonMagikLogo variant="white" size="sm" />

        {/* Quote */}
        <div>
          <blockquote className="mb-8 font-serif text-[clamp(22px,2.2vw,30px)] font-medium leading-[1.22] text-white">
            "I stopped losing bookings in WhatsApp the day I switched."
          </blockquote>
          <p className="text-[14px] text-white/50">Salon owner, Accra</p>

          {/* Mini cards */}
          <div className="relative mt-10 h-[130px]">
            {/* Revenue card */}
            <div
              className="absolute rounded-[16px] bg-white px-5 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
              style={{ width: 190, top: 0, left: 0 }}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-black/40">This week</div>
              <div className="mt-0.5 text-[11px] text-black/50">Booked revenue</div>
              <div className="mt-1 font-serif text-[24px] font-medium text-black">₵4,280</div>
            </div>

            {/* Reminder card */}
            <div
              className="absolute rounded-[16px] px-5 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)]"
              style={{
                background: "#F4C84E",
                width: 190,
                top: 24,
                left: 130,
              }}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-black/50">Reminder sent</div>
              <div className="mt-1 font-serif text-[17px] font-medium text-black">Delivered to Efua</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-[12px] text-white/30">© Salon Magik, a Gray Avenue LTD company</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[#F8F6F2] px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <SalonMagikLogo size="md" />
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <h1 className="text-[28px] font-semibold tracking-[-0.3px] text-gray-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[15px] text-gray-500">{subtitle}</p>}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
