import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "@shared/utils";
import { buttonVariants } from "@ui/button";
import { BRAND_DIALOG_STYLE } from "./dialog-brand";

const AlertDialog: typeof AlertDialogPrimitive.Root = AlertDialogPrimitive.Root;

const AlertDialogTrigger: typeof AlertDialogPrimitive.Trigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal: typeof AlertDialogPrimitive.Portal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // z-[70]: above SalonSidebar's fixed z-[60] desktop rail.
      "fixed inset-0 z-[70] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        // Same permanent brand-plum "sandwich" frame as Dialog — see
        // dialog.tsx for why the border stays even without a
        // AlertDialogHeader/Footer, and why those bleed into it via
        // negative margin + sticky positioning when they are present.
        "fixed inset-x-3 top-[50%] z-[70] grid w-auto max-h-[calc(100vh-1.5rem)] translate-y-[-50%] overflow-y-auto gap-5 rounded-[24px] border-0 border-t-[6px] border-b-[6px] border-t-[#2E1F4E] border-b-[#2E1F4E] bg-background p-5 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:left-[50%] sm:right-auto sm:w-full sm:max-w-lg sm:translate-x-[-50%] sm:p-8",
        className,
      )}
      {...props}
    >
      {children}
    </AlertDialogPrimitive.Content>
  </AlertDialogPortal>
));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "dark sticky top-0 z-10 -mx-5 -mt-5 rounded-t-[18px] bg-background px-5 pb-4 pt-5 text-foreground sm:-mx-8 sm:-mt-8 sm:px-8 sm:pb-5 sm:pt-7",
      "flex flex-col space-y-2 text-center sm:text-left",
      className,
    )}
    style={{ ...BRAND_DIALOG_STYLE, ...style }}
    {...props}
  />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
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
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("font-serif text-xl font-semibold", className)} {...props} />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
    {...props}
  />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
