import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { EventData, Step } from "react-joyride";
import { useAuth } from "@/hooks/useAuth";

// Inlined instead of importing react-joyride's `EVENTS`/`STATUS` consts:
// react-joyride ships as a single bundled module, so importing anything
// from it at runtime here would pull the whole library (and its
// floating-ui dependency) back into the main bundle, defeating the point
// of lazy-loading ProductTourRenderer below. These two string literals
// are its actual values (react-joyride/dist/index.mjs).
const TOUR_END_EVENT = "tour:end";
const FINISHED_STATUS = "finished";
const SKIPPED_STATUS = "skipped";

// react-joyride + its tooltip live in their own chunk (see
// ProductTourRenderer), loaded only once a tour actually starts — this file
// stays cheap so it can be mounted at the App root for every user without
// adding to everyone's initial bundle.
const ProductTourRenderer = lazy(() => import("./ProductTourRenderer"));

export interface ProductTourStepInput {
  id: string;
  path: string;
  target: string;
  title: string;
  content: string;
  placement?: Step["placement"];
}

export interface StartTourInput {
  /** Flattened spotlight steps to run, in order — may come from one walkthrough or several concatenated. */
  steps: ProductTourStepInput[];
  /** Every walkthrough id represented in `steps`, marked seen together when the run finishes or is skipped. */
  walkthroughIds: string[];
}

interface ProductTourContextValue {
  startTour: (input: StartTourInput) => void;
  isTourActive: boolean;
  hasSeenWalkthrough: (id: string) => boolean;
}

const ProductTourContext = createContext<ProductTourContextValue | undefined>(undefined);

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

// Matches Tailwind's `lg` breakpoint, which is what the real tour targets
// (Add Service, Invite Staff) switch on between their desktop button and
// mobile FAB variants.
export function useIsDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

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
  const [activeWalkthroughIds, setActiveWalkthroughIds] = useState<string[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => {
    if (!user?.id) return new Set();
    try {
      const raw = localStorage.getItem(tourSeenKey(user.id));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markSeen = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setSeenIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        if (user?.id) {
          localStorage.setItem(tourSeenKey(user.id), JSON.stringify(Array.from(next)));
        }
        return next;
      });
    },
    [user?.id],
  );

  const hasSeenWalkthrough = useCallback((id: string) => seenIds.has(id), [seenIds]);

  const startTour = useCallback(
    ({ steps: input, walkthroughIds }: StartTourInput) => {
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
      setActiveWalkthroughIds(walkthroughIds);
      setRun(true);
    },
    [navigate],
  );

  const handleEvent = useCallback(
    (data: EventData) => {
      if (data.type === TOUR_END_EVENT) {
        setRun(false);
        setSteps([]);
        if (data.status === FINISHED_STATUS || data.status === SKIPPED_STATUS) {
          markSeen(activeWalkthroughIds);
        }
        setActiveWalkthroughIds([]);
      }
    },
    [markSeen, activeWalkthroughIds],
  );

  const value = useMemo<ProductTourContextValue>(
    () => ({ startTour, isTourActive: run, hasSeenWalkthrough }),
    [startTour, run, hasSeenWalkthrough],
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      {steps.length > 0 && (
        <Suspense fallback={null}>
          <ProductTourRenderer steps={steps} run={run} onEvent={handleEvent} />
        </Suspense>
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
