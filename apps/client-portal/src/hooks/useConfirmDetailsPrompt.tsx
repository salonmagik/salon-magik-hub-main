import { createContext, useContext, useState, type ReactNode } from "react";

interface ConfirmDetailsPromptValue {
  forceOpen: boolean;
  requestOpen: () => void;
  setForceOpen: (open: boolean) => void;
}

const ConfirmDetailsPromptContext = createContext<ConfirmDetailsPromptValue | null>(null);

/**
 * The confirm-details modal renders once at the app shell so it can nudge a
 * customer from any page, but the "you skipped this — confirm now" banner
 * lives on the profile page. This context is the one wire between them, so
 * the profile page doesn't need to know the modal is a shell-level thing.
 */
export function ConfirmDetailsPromptProvider({ children }: { children: ReactNode }) {
  const [forceOpen, setForceOpen] = useState(false);
  return (
    <ConfirmDetailsPromptContext.Provider value={{ forceOpen, requestOpen: () => setForceOpen(true), setForceOpen }}>
      {children}
    </ConfirmDetailsPromptContext.Provider>
  );
}

export function useConfirmDetailsPrompt() {
  const ctx = useContext(ConfirmDetailsPromptContext);
  if (!ctx) throw new Error("useConfirmDetailsPrompt must be used within ConfirmDetailsPromptProvider");
  return ctx;
}
