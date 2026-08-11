import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@shared/utils";
import { BRAND_DIALOG_STYLE } from "./dialog-brand";

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
          //
          // The top/bottom brand-plum border is permanent — every dialog
          // keeps the purple "sandwich" frame even when it has no
          // DialogHeader/DialogFooter. When one IS present, it bleeds via
          // negative margin right up against this border so the two merge
          // into one solid purple band instead of reading as separate.
          "fixed left-3 right-3 top-1/2 z-[70] grid w-auto max-h-[calc(100vh-1.5rem)] -translate-y-1/2 overflow-y-auto scrollbar-hide gap-5 rounded-[24px] border-0 border-t-[6px] border-b-[6px] border-t-[#2E1F4E] border-b-[#2E1F4E] bg-background p-5 shadow-2xl duration-200",
          "sm:left-[50%] sm:right-auto sm:top-[50%] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[90vh] sm:p-8",
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

// Bleeds edge-to-edge to the top corners of DialogContent (cancelling its
// padding via negative margin) and fills with the same brand-plum the
// product-tour tooltip uses. Sticky so it stays pinned at the top of the
// dialog's own scroll area — only the content between header and footer
// scrolls underneath it, the purple frame never moves.
const DialogHeader = ({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "dark sticky top-0 z-10 -mx-5 -mt-5 rounded-t-[18px] bg-background px-5 pb-4 pt-5 text-foreground sm:-mx-8 sm:-mt-8 sm:px-8 sm:pb-5 sm:pt-7",
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    style={{ ...BRAND_DIALOG_STYLE, ...style }}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "dark sticky bottom-0 z-10 -mx-5 -mb-5 rounded-b-[18px] bg-background px-5 pb-5 pt-4 text-foreground sm:-mx-8 sm:-mb-8 sm:px-8 sm:pb-7 sm:pt-5",
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    style={{ ...BRAND_DIALOG_STYLE, ...style }}
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
