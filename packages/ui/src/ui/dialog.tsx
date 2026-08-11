import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@shared/utils";
import { BRAND_DIALOG_STYLE, FOOTER_ACCENT_STYLE } from "./dialog-brand";

const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root;

const DialogTrigger: typeof DialogPrimitive.Trigger = DialogPrimitive.Trigger;

const DialogPortal: typeof DialogPrimitive.Portal = DialogPrimitive.Portal;

const DialogClose: typeof DialogPrimitive.Close = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // z-[70]: above SalonSidebar's fixed z-[60] desktop rail — otherwise
      // the sidebar renders on top of the dialog instead of behind it.
      "fixed inset-0 z-[70] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  // Most dialogs have a DialogHeader, which the close button sits on top of
  // (so it defaults to a light color). The handful that don't need a dark
  // variant instead — see PaymentSuccessModal / ImageCarousel / QuickCreateDialog.
  closeButtonClassName?: string;
}

// DialogContent has zero padding of its own — DialogHeader/DialogFooter
// need to bleed full-width, and (confirmed empirically: forcing
// position:static closes the gap, sticky reopens it) position:sticky
// elements don't reliably escape an ancestor's padding via negative
// margin. Rather than try to detect/extract Header and Footer from
// children (many dialogs nest DialogFooter inside their own <form> so a
// type="submit" button works — extracting it out would silently break
// that submit), children render exactly as authored. Each dialog is
// responsible for wrapping its own field content in a padded container;
// see dialog-brand.ts's DIALOG_BODY_PADDING class string for the
// standard value to use there.
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, closeButtonClassName, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Centered and sized to content (up to the max-height cap), not
          // stretched to fill the viewport — a short dialog on a tall phone
          // screen used to end up mostly empty space between its content and
          // the close button/footer. overflow-y-auto still kicks in once
          // content actually exceeds the cap.
          "fixed left-3 right-3 top-1/2 z-[70] flex flex-col w-auto max-h-[calc(100vh-1.5rem)] -translate-y-1/2 overflow-y-auto scrollbar-hide rounded-[24px] border-0 bg-background p-0 shadow-2xl duration-200",
          "sm:left-[50%] sm:right-auto sm:top-[50%] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[90vh]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            "absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none",
            closeButtonClassName,
          )}
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

// Full-bleed brand-plum fill, same as the product-tour tooltip. DialogContent
// has zero padding, so this sits flush against its edges with no bleed
// trick needed — it just has to actually be a direct child of DialogContent
// (not nested inside a <form> or other wrapper) for that to hold. Sticky so
// it stays pinned while only the body between header and footer scrolls.
const DialogHeader = ({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "dark sticky top-0 z-10 flex-shrink-0 rounded-t-[24px] bg-background px-5 pb-4 pt-5 text-foreground sm:px-8 sm:pb-5 sm:pt-7",
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    style={{ ...BRAND_DIALOG_STYLE, ...style }}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

// Stays on the app's normal light surface (not the header's brand-plum
// fill) — just a lighter purple top border marking it as the action row,
// sticky so it (and its buttons) stay pinned while only the content above
// scrolls. FOOTER_ACCENT_STYLE retints its buttons: gold primary, soft
// lavender outline — see dialog-brand.ts. Same caveat as DialogHeader: for
// the full-bleed + sticky combo to work, this needs zero ancestor padding
// between it and DialogContent — if it's nested inside a <form>, that form
// (and only the form, not this) is what needs padding, applied to a
// wrapper around the form's fields, not the form element itself.
const DialogFooter = ({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky bottom-0 z-10 flex-shrink-0 rounded-b-[24px] border-t-[3px] border-t-[#9E88C4] bg-background px-5 pb-5 pt-4 sm:px-8 sm:pb-7 sm:pt-5",
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    style={{ ...FOOTER_ACCENT_STYLE, ...style }}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-serif text-xl font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
