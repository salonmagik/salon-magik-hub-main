import { usePlans } from "@/hooks";
import founderImg from "@/assets/founder-photo.png";

export function SocialProof () {
    const { data: plans } = usePlans();
  const trialDays =
		plans?.find((p) => p.is_recommended)?.trial_days ??
		plans?.[0]?.trial_days ??
		14;
  return (
    <div className="bg-brand-purple-deep px-8 py-10">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-6">
        <img src={founderImg} alt="Founder of Salon Magik" className="h-14 w-14 flex-shrink-0 rounded-full object-cover object-top" />

        {/* Quote */}
        <p className="min-w-[260px] flex-1 font-serif text-[15px] italic text-brand-lilac">
          "I built this after watching salon owners I know, run their whole business out of a notebook and a group chat. There had to be a better way."
          <b className="mt-1.5 block font-sans text-[12.5px] font-normal not-italic text-white/50">
            Founder, Salon Magik
          </b>
        </p>

        {/* Stats */}
        <div className="flex gap-10">
          <div className="text-right">
            <b className="block font-serif text-[20px] text-brand-yellow">Private beta</b>
            <span className="text-[11.5px] text-white/50">Now onboarding</span>
          </div>
          <div className="text-right">
            <b className="block font-serif text-[20px] text-brand-yellow">{trialDays} days</b>
            <span className="text-[11.5px] text-white/50">Free trial</span>
          </div>
          <div className="text-right">
            <b className="block font-serif text-[20px] text-brand-yellow">🇬🇭 🇳🇬</b>
            <span className="text-[11.5px] text-white/50">Built locally</span>
          </div>
        </div>
      </div>
    </div>
  );
}
