import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@ui/dialog";
import { WaitlistForm } from "@/components/WaitlistForm";

interface WaitlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "waitlist" | "interest";
  source?: "hero_cta" | "footer_cta" | "launch_section";
}

export function WaitlistDialog({
  open,
  onOpenChange,
  mode = "waitlist",
  source = "footer_cta",
}: WaitlistDialogProps) {
  const isInterestMode = mode === "interest";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">
            {isInterestMode ? "Register Interest" : "Get Exclusive Access"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isInterestMode
              ? "Register your interest for countries outside Ghana and Nigeria"
              : "Sign up to get early access to Salon Magik"}
          </DialogDescription>
        </DialogHeader>
        <WaitlistForm mode={mode} source={source} />
      </DialogContent>
    </Dialog>
  );
}
