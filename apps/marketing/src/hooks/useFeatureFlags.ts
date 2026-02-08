const waitlistEnv = import.meta.env.VITE_WAITLIST_MODE;

export function useWaitlistMode() {
  const isWaitlistMode = String(waitlistEnv ?? "").toLowerCase() === "true";
  return { isWaitlistMode };
}

export function useFeatureFlags() {
  return { waitlist: useWaitlistMode().isWaitlistMode };
}
