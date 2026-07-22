import { useEffect, useState } from "react";

interface LandingHeroProps {
  isWaitlistMode: boolean;
  isLoading: boolean;
  onWaitlistClick?: () => void;
}

// Each card has its own independent content pool, cycling at different rates
const BOOKING_CONTENT = [
  { time: "Today, 2:30 PM", service: "Braids & Treatment", stylist: "Ife", duration: "90 min", status: "Confirmed" },
  { time: "Today, 11:00 AM", service: "Hair Locs Installation", stylist: "Chidi", duration: "2h 30 min", status: "Confirmed" },
  { time: "Tomorrow, 9:00 AM", service: "Knotless Braids", stylist: "Amara", duration: "3h", status: "Upcoming" },
];

const REVENUE_CONTENT = [
  { label: "This week", amount: "₵4,280", sub: "Booked revenue · +18%", badge: "On track" },
  { label: "This month", amount: "₦85,400", sub: "Booked revenue · +24%", badge: "Ahead of target" },
  { label: "This week", amount: "₵6,100", sub: "Booked revenue · +31%", badge: "Best week yet" },
];

const REMINDER_CONTENT = [
  { recipient: "Efua", preview: '"See you tomorrow at 10am!"', badge: "Delivered" },
  { recipient: "Tolu", preview: '"Your appointment is in 1 hour!"', badge: "Delivered" },
  { recipient: "Adaeze", preview: '"Don\'t forget your locs session!"', badge: "Delivered" },
];

export function LandingHero({ isWaitlistMode, isLoading, onWaitlistClick }: LandingHeroProps) {
  const defaultSalonAppUrl = import.meta.env.DEV ? "http://localhost:8080" : "https://app.salonmagik.com";
  const salonAppUrl = (import.meta.env.VITE_SALON_APP_URL || defaultSalonAppUrl).replace(/\/$/, "");

  // Each card cycles independently — different intervals, different starting positions
  const [bookingIdx, setBookingIdx] = useState(0);
  const [revenueIdx, setRevenueIdx] = useState(1);
  const [reminderIdx, setReminderIdx] = useState(2);

  // Keys trigger the fade-in animation on each card independently
  const [bookingKey, setBookingKey] = useState(0);
  const [revenueKey, setRevenueKey] = useState(0);
  const [reminderKey, setReminderKey] = useState(0);

  useEffect(() => {
    const a = setInterval(() => {
      setBookingIdx((i) => (i + 1) % BOOKING_CONTENT.length);
      setBookingKey((k) => k + 1);
    }, 4000);
    const b = setInterval(() => {
      setRevenueIdx((i) => (i + 1) % REVENUE_CONTENT.length);
      setRevenueKey((k) => k + 1);
    }, 4700);
    const c = setInterval(() => {
      setReminderIdx((i) => (i + 1) % REMINDER_CONTENT.length);
      setReminderKey((k) => k + 1);
    }, 5500);
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); };
  }, []);

  const booking = BOOKING_CONTENT[bookingIdx];
  const revenue = REVENUE_CONTENT[revenueIdx];
  const reminder = REMINDER_CONTENT[reminderIdx];

  return (
    <header
      className="relative overflow-hidden bg-brand-purple pb-6 pt-24"
      style={{
        backgroundImage:
          "radial-gradient(circle at 82% 8%, rgba(244,200,78,0.10), transparent 45%), radial-gradient(circle at 8% 92%, rgba(184,169,217,0.12), transparent 40%)",
      }}
    >
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-8 md:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-yellow/35 px-[14px] py-[7px] text-[13px] uppercase tracking-[0.06em] text-brand-yellow">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-yellow" />
            Built for beauty businesses
          </div>

          <h1 className="font-serif text-[clamp(38px,5vw,56px)] font-medium leading-[1.08] tracking-[-0.5px] text-white">
            Everything your salon needs,{" "}
            <em className="font-medium text-brand-yellow">minus the chaos.</em>
          </h1>

          <p className="mt-6 max-w-[460px] text-[18px] leading-relaxed text-brand-lilac">
            Bookings, staff, payments and client messages, organised in one place, so nothing gets lost in a notebook or a group chat again.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-6">
            {!isLoading && !isWaitlistMode && (
              <>
                <a
                  href={`${salonAppUrl}/signup`}
                  className="inline-block rounded-full bg-brand-yellow px-7 py-[15px] text-[15.5px] font-medium text-brand-purple-deep transition-transform hover:-translate-y-0.5"
                >
                  Start free, no card needed
                </a>
                <a href="#" className="border-b border-white/35 pb-0.5 text-[15px] text-white">
                  Watch a 90 sec tour →
                </a>
              </>
            )}
            {!isLoading && isWaitlistMode && (
              <button
                type="button"
                onClick={onWaitlistClick}
                className="inline-block rounded-full bg-brand-yellow px-7 py-[15px] text-[15.5px] font-medium text-brand-purple-deep transition-transform hover:-translate-y-0.5"
              >
                Get exclusive access
              </button>
            )}
          </div>
        </div>

        {/* Floating card stack — each card cycles independently */}
        <div className="relative h-[420px] md:h-[460px]">
          {/* Booking card — white, rotates -7deg */}
          <div
            className="hero-card-a absolute rounded-[20px] bg-brand-cream p-[22px] text-brand-ink shadow-[0_30px_60px_rgba(0,0,0,0.35)]"
            style={{ width: 280, top: 10, left: 40, zIndex: 2 }}
          >
            <div key={bookingKey} className="hero-card-content">
              <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-brand-ink/60">{booking.time}</div>
              <div className="font-serif text-[19px]">{booking.service}</div>
              <div className="mt-1 text-[13px] text-brand-ink/70">with {booking.stylist} · {booking.duration}</div>
              <span className="mt-3 inline-block rounded-full bg-black/8 px-[10px] py-1 text-[11.5px]">{booking.status}</span>
            </div>
          </div>

          {/* Revenue card — dark, rotates +5deg */}
          <div
            className="hero-card-b absolute rounded-[20px] bg-brand-ink p-[22px] text-white shadow-[0_30px_60px_rgba(0,0,0,0.35)]"
            style={{ width: 240, top: 120, left: 160, zIndex: 3 }}
          >
            <div key={revenueKey} className="hero-card-content">
              <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-white/60">{revenue.label}</div>
              <div className="font-serif text-[19px]">{revenue.amount}</div>
              <div className="mt-1 text-[13px] text-white/70">{revenue.sub}</div>
              <span className="mt-3 inline-block rounded-full bg-white/15 px-[10px] py-1 text-[11.5px]">{revenue.badge}</span>
            </div>
          </div>

          {/* Reminder card — gold, rotates -3deg */}
          <div
            className="hero-card-c absolute rounded-[20px] bg-brand-yellow p-[22px] shadow-[0_30px_60px_rgba(0,0,0,0.35)]"
            style={{ width: 250, top: 260, left: 10, zIndex: 1 }}
          >
            <div key={reminderKey} className="hero-card-content">
              <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-brand-purple-deep/60">Reminder sent</div>
              <div className="font-serif text-[19px] text-brand-purple-deep">Hi {reminder.recipient} 👋</div>
              <div className="mt-1 text-[13px] text-brand-purple-deep/70">{reminder.preview}</div>
              <span className="mt-3 inline-block rounded-full bg-black/10 px-[10px] py-1 text-[11.5px] text-brand-purple-deep">
                {reminder.badge}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
