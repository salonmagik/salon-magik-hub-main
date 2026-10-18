// The gift-box glyph used on every product card in the Bookings & Orders
// redesign, matching the design's icon treatment (gold tile, stroke icon).
export function ProductIcon() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF2CE] text-[#8A6510]">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    </div>
  );
}
