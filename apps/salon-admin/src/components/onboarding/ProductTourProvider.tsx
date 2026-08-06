import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Joyride, EVENTS, STATUS, type EventData, type Step } from "react-joyride";
import { useAuth } from "@/hooks/useAuth";

export interface ProductTourStepInput {
  id: string;
  path: string;
  target: string;
  title: string;
  content: string;
  placement?: Step["placement"];
}

interface ProductTourContextValue {
  startTour: (steps: ProductTourStepInput[]) => void;
  isTourActive: boolean;
  hasSeenTour: boolean;
}

const ProductTourContext = createContext<ProductTourContextValue | undefined>(undefined);

function tourSeenKey(userId: string) {
  return `salonmagik.tour.seen.${userId}`;
}

const TARGET_POLL_INTERVAL_MS = 100;
const TARGET_WAIT_TIMEOUT_MS = 6000;

function waitForTarget(selector: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (document.querySelector(selector) || Date.now() - start >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(check, TARGET_POLL_INTERVAL_MS);
    };
    check();
  });
}

// Cross-page steps navigate then wait for the next page's lazy-loaded target
// to actually mount, all inside the `before` hook. This can't be left to
// react-joyride's own `targetWaitTimeout` polling: that polling path only
// runs for steps with NO `before` hook — when a `before` hook is present,
// v3 checks for the target synchronously the instant the hook's promise
// resolves, which is before React has committed the route change, so it
// reads "not found" and silently skips every step in a cascade.
export function ProductTourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [steps, setSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState(() => {
    if (!user?.id) return false;
    return localStorage.getItem(tourSeenKey(user.id)) === "true";
  });

  const markSeen = useCallback(() => {
    if (user?.id) {
      localStorage.setItem(tourSeenKey(user.id), "true");
    }
    setHasSeenTour(true);
  }, [user?.id]);

  const startTour = useCallback(
    (input: ProductTourStepInput[]) => {
      if (input.length === 0) return;
      const joyrideSteps: Step[] = input.map((step) => ({
        target: step.target,
        title: step.title,
        content: step.content,
        placement: step.placement || "bottom",
        beforeTimeout: TARGET_WAIT_TIMEOUT_MS + 2000,
        before: async () => {
          navigate(step.path);
          await waitForTarget(step.target, TARGET_WAIT_TIMEOUT_MS);
        },
      }));
      setSteps(joyrideSteps);
      setRun(true);
    },
    [navigate],
  );

  const handleEvent = useCallback(
    (data: EventData) => {
      if (data.type === EVENTS.TOUR_END) {
        setRun(false);
        setSteps([]);
        if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
          markSeen();
        }
      }
    },
    [markSeen],
  );

  const value = useMemo<ProductTourContextValue>(
    () => ({ startTour, isTourActive: run, hasSeenTour }),
    [startTour, run, hasSeenTour],
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      {steps.length > 0 && (
        <Joyride
          steps={steps}
          run={run}
          continuous
          onEvent={handleEvent}
          locale={{ last: "Done", skip: "Skip tour" }}
          options={{
            primaryColor: "#2E1F4E",
            zIndex: 10000,
            showProgress: true,
            skipBeacon: true,
            buttons: ["back", "close", "skip", "primary"],
          }}
        />
      )}
    </ProductTourContext.Provider>
  );
}

export function useProductTour() {
  const ctx = useContext(ProductTourContext);
  if (!ctx) {
    throw new Error("useProductTour must be used within a ProductTourProvider");
  }
  return ctx;
}
