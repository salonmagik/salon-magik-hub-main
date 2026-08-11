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
