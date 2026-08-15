import type { CSSProperties } from "react";

// Every dialog/alert-dialog surface renders as the same fixed brand-plum
// card the product-tour tooltip already uses (#2E1F4E / gold accent),
// regardless of the app's light/dark theme toggle. These are literally the
// existing --primary (light-mode) and --accent tokens, just applied as a
// fill instead of a button color — see ProductTourRenderer.tsx.
//
// Combined with the "dark" className on the dialog root, everything we
// don't explicitly override here (--primary, --destructive, --ring, etc.)
// still resolves through the app's own .dark token set in index.css, so
// nested content (buttons, badges, inputs) stays correctly light-on-dark
// without needing to touch every individual dialog.
export const BRAND_DIALOG_STYLE: CSSProperties = {
  ["--background" as string]: "262 43% 21%",
  ["--foreground" as string]: "0 0% 100%",
  ["--card" as string]: "262 38% 26%",
  ["--card-foreground" as string]: "0 0% 100%",
  ["--popover" as string]: "262 38% 26%",
  ["--popover-foreground" as string]: "0 0% 100%",
  ["--secondary" as string]: "262 30% 28%",
  ["--secondary-foreground" as string]: "0 0% 100%",
  ["--muted" as string]: "262 30% 28%",
  ["--muted-foreground" as string]: "258 24% 81%",
  ["--border" as string]: "262 28% 34%",
  ["--input" as string]: "262 28% 34%",
};

// The footer stays on the app's plain light surface (not the brand-plum
// fill above) — only its buttons get retinted: a "positive" action reads
// gold (the same --accent already used everywhere else), a Cancel/Close
// reads as a soft lavender-glass outline instead of the default neutral
// gray. Any <Button> dropped into a DialogFooter/AlertDialogFooter picks
// these up automatically since Button's variants are just --primary /
// --input read through CSS custom properties — no per-dialog class needed.
//
// Button's outline variant hovers to --accent, which is gold app-wide —
// right for most secondary actions, wrong for a dismissive one (Cancel
// hovering gold reads as if it were the positive choice). Every dialog's
// outline button is that dismissive action, so --accent is retinted here
// to the same pale-pink/dark-red pairing --destructive-bg already uses
// elsewhere, rather than touching the global gold accent everyone else
// still relies on outside of dialogs.
export const FOOTER_ACCENT_STYLE: CSSProperties = {
  ["--primary" as string]: "42 89% 63%",
  ["--primary-foreground" as string]: "262 46% 15%",
  ["--input" as string]: "262 45% 88%",
  ["--border" as string]: "262 45% 88%",
  ["--ring" as string]: "42 89% 63%",
  ["--accent" as string]: "0 93% 94%",
  ["--accent-foreground" as string]: "0 70% 35%",
};

// DialogContent carries zero padding so DialogHeader/DialogFooter can
// bleed full-width with no escape trick needed (see dialog.tsx). Anything
// else — the field content between them — needs this applied to its own
// wrapper instead. For a dialog that wraps its fields *and* DialogFooter
// in one <form> (needed for a type="submit" button to work), put this on
// a div around just the fields, leaving DialogFooter as an unpadded
// sibling of that div, still inside the same <form>:
//
//   <form onSubmit={...}>
//     <div className={DIALOG_BODY_PADDING}>{/* fields */}</div>
//     <DialogFooter>...</DialogFooter>
//   </form>
export const DIALOG_BODY_PADDING = "px-5 pt-5 pb-5 sm:px-8 sm:pt-7 sm:pb-8 space-y-4";
