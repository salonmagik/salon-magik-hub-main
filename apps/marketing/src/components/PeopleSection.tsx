import manSalonClientImg from "@/assets/man-salon-client.jpg";

function Check() {
  return (
    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-purple text-[11px] text-brand-yellow">
      ✓
    </span>
  );
}

export function PeopleSection() {
  return (
		<section className="bg-white px-8 py-[110px]">
			<div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-16 md:grid-cols-2">
				{/* Photo */}
				<div className="overflow-hidden rounded-3xl">
					<img
						src={manSalonClientImg}
						alt="Stylist at work with a client"
						className="aspect-[4/5] w-full object-cover object-center"
					/>
				</div>

				{/* Copy */}
				<div>
					<div className="mb-4 flex items-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
						<span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
						Built for real salons
					</div>
					<h2 className="mb-[18px] font-serif text-[clamp(26px,3vw,34px)] font-medium leading-[1.18] tracking-[-0.3px] text-brand-ink">
						Designed around how real salons actually run.
					</h2>
					<p className="mb-4 max-w-[460px] text-[16px] leading-[1.7] text-brand-ink/65">
						Not a generic scheduling tool adapted for beauty businesses. Every
						screen was built around what a stylist, a front desk, and an owner
						in Accra or Lagos actually need on a Tuesday afternoon.
					</p>
					<ul className="mt-6 flex flex-col gap-3">
						{[
							"Works even when a connection drops mid-checkout",
							"Mobile money and card, side by side, not bolted on",
							"Built with input from salon owners, not guessed at",
						].map((item) => (
							<li
								key={item}
								className="flex items-start gap-2.5 text-[14.5px] text-brand-ink/75"
							>
								<Check />
								{item}
							</li>
						))}
					</ul>
				</div>
			</div>
		</section>
	);
}
