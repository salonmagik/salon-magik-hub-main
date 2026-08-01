import { createContext, useContext, useState, type ReactNode } from "react";
import { WaitlistDialog } from "./WaitlistDialog";

interface WaitlistContextValue {
  openWaitlist: () => void;
}

const WaitlistContext = createContext<WaitlistContextValue>({
  openWaitlist: () => {},
});

export function useWaitlist(): WaitlistContextValue {
  return useContext(WaitlistContext);
}

/**
 * Provides a single, app-wide "exclusive access" waitlist dialog so any CTA
 * (shared nav header, pricing cards, etc.) can open it from any marketing page
 * — not just the landing page, which manages its own local dialog state.
 */
export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <WaitlistContext.Provider value={{ openWaitlist: () => setOpen(true) }}>
      {children}
      <WaitlistDialog
        open={open}
        onOpenChange={setOpen}
        mode="waitlist"
        source="footer_cta"
      />
    </WaitlistContext.Provider>
  );
}
