import { Link } from "react-router-dom";

const types = [
  { emoji: "💇🏾‍♀️", name: "Hair salons", desc: "Braiding, styling, treatments" },
  { emoji: "💅🏾", name: "Nail studios", desc: "Manicure, pedicure, extensions" },
  { emoji: "💈", name: "Barbershops", desc: "Cuts, shaves, grooming" },
  { emoji: "🧖🏾", name: "Spas & wellness", desc: "Massage, facials, body treatments" },
  { emoji: "✂️", name: "Freelance stylists", desc: "Home service, chair rental, mobile" },
  { emoji: "🎨", name: "Tattoo studios", desc: "Custom art, piercings, long sessions" },
];

export function BusinessTypesSection() {
  return (
    <section className="bg-brand-cream px-8 py-[90px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-10 text-center">
          <div className="mb-4 flex items-center justify-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
            <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
            Who it's for
          </div>
          <h2 className="font-serif text-[clamp(26px,3.5vw,36px)] font-medium leading-[1.18] tracking-[-0.3px] text-brand-ink">
            Built for every beauty business.
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
          {types.map((t) => (
            <div
              key={t.name}
              className="rounded-[18px] border border-brand-ink/8 bg-white px-6 py-7"
            >
              <div className="mb-4 text-[36px] leading-none">{t.emoji}</div>
              <div className="font-serif text-[17px] font-medium text-brand-ink">{t.name}</div>
              <div className="mt-1 text-[13px] text-brand-ink/55">{t.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/for-salons"
            className="inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-purple transition-colors hover:text-brand-purple-deep"
          >
            Learn more about who Salon Magik is built for →
          </Link>
        </div>
      </div>
    </section>
  );
}
