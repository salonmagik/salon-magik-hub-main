import type { User } from "@supabase/supabase-js";

export function needsGoogleProfileCompletion(user: User | null): boolean {
  if (!user) return false;

  const provider = user.app_metadata?.provider;
  if (provider !== "google") return false;

  const metadata = user.user_metadata ?? {};
  return !metadata.first_name || !metadata.last_name || !metadata.phone;
}
