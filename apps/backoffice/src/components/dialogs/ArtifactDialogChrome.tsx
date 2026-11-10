import * as React from "react";
import {
  DialogContent as BaseDialogContent,
  DialogHeader as BaseDialogHeader,
  DialogFooter as BaseDialogFooter,
  DialogTitle as BaseDialogTitle,
} from "@ui/dialog";
import { cn } from "@shared/utils";

/**
 * The shared Dialog (packages/ui/src/ui/dialog.tsx + dialog-brand.ts) renders
 * a deliberate, documented, product-wide "brand-plum" header fill + gold
 * footer accent + 24px radius + serif title — used by every app. The
 * redesign artifact's modals (ModalInviteAdmin.dc.html etc.) are plain:
 * 16px radius, no colored fill, sans title, 20/24px header-footer padding.
 *
 * Rather than touch the shared component (used by salon-admin and
 * client-portal too), these wrappers override per-instance: the forced
 * "dark" class on DialogHeader is harmless (backoffice is already dark by
 * default), but BRAND_DIALOG_STYLE/FOOTER_ACCENT_STYLE's inline custom
 * properties win over it and must be neutralized back to this app's real
 * `.dark` token values (packages/ui/src/theme.css) via an equal-or-later
 * inline `style` override — these are literal copies of that block's
 * values, not a token reference (CSS custom properties can't `var()` a
 * sibling scope that is itself being overridden in the same style object).
 */
const NEUTRAL_HEADER_STYLE: React.CSSProperties = {
  ["--background" as string]: "251 24% 13%",
  ["--foreground" as string]: "257 28% 95%",
  ["--card" as string]: "251 24% 13%",
  ["--card-foreground" as string]: "257 28% 95%",
  ["--popover" as string]: "251 24% 13%",
  ["--popover-foreground" as string]: "257 28% 95%",
  ["--secondary" as string]: "251 31% 21%",
  ["--secondary-foreground" as string]: "257 28% 95%",
  ["--muted" as string]: "250 26% 17%",
  ["--muted-foreground" as string]: "254 15% 73%",
  ["--border" as string]: "252 21% 23%",
  ["--input" as string]: "252 21% 23%",
};

const NEUTRAL_FOOTER_STYLE: React.CSSProperties = {
  ["--primary" as string]: "256 49% 68%",
  ["--primary-foreground" as string]: "256 25% 12%",
  ["--input" as string]: "252 21% 23%",
  ["--border" as string]: "252 21% 23%",
  ["--ring" as string]: "256 49% 68%",
  ["--accent" as string]: "251 31% 21%",
  ["--accent-foreground" as string]: "257 28% 95%",
};

export const ArtifactDialogContent = React.forwardRef<
  React.ElementRef<typeof BaseDialogContent>,
  React.ComponentPropsWithoutRef<typeof BaseDialogContent>
>(({ className, closeButtonClassName, ...props }, ref) => (
  <BaseDialogContent
    ref={ref}
    className={cn("max-w-[480px] rounded-2xl bg-card", className)}
    closeButtonClassName={cn(
      "right-[18px] top-[18px] h-[26px] w-[26px] rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground",
      closeButtonClassName,
    )}
    {...props}
  />
));
ArtifactDialogContent.displayName = "ArtifactDialogContent";

export const ArtifactDialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <BaseDialogHeader
    ref={ref}
    className={cn("space-y-0 rounded-t-2xl bg-card px-6 py-5 text-foreground", className)}
    style={{ ...NEUTRAL_HEADER_STYLE, ...style }}
    {...props}
  />
));
ArtifactDialogHeader.displayName = "ArtifactDialogHeader";

export const ArtifactDialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <BaseDialogFooter
    ref={ref}
    className={cn("rounded-b-2xl border-t-border bg-card px-6 py-4", className)}
    style={{ ...NEUTRAL_FOOTER_STYLE, ...style }}
    {...props}
  />
));
ArtifactDialogFooter.displayName = "ArtifactDialogFooter";

export const ArtifactDialogTitle = React.forwardRef<
  React.ElementRef<typeof BaseDialogTitle>,
  React.ComponentPropsWithoutRef<typeof BaseDialogTitle>
>(({ className, ...props }, ref) => (
  <BaseDialogTitle ref={ref} className={cn("font-sans text-[15px] font-bold tracking-normal", className)} {...props} />
));
ArtifactDialogTitle.displayName = "ArtifactDialogTitle";

/** Matches the artifact's field body padding: 20px 24px, 14px gap between fields. */
export const ARTIFACT_DIALOG_BODY_PADDING = "px-6 py-5 space-y-3.5";
