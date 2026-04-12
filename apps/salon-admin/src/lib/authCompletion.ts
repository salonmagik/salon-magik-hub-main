import type { User } from "@supabase/supabase-js";

function splitFullName(fullName?: string | null) {
  const normalized = fullName?.trim();
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

export function getGoogleProfileFields(user: User | null) {
  const metadata = user?.user_metadata ?? {};
  const fullName = metadata.full_name || metadata.name || "";
  const splitName = splitFullName(typeof fullName === "string" ? fullName : "");

  const firstName =
    typeof metadata.first_name === "string" && metadata.first_name.trim()
      ? metadata.first_name.trim()
      : typeof metadata.given_name === "string" && metadata.given_name.trim()
        ? metadata.given_name.trim()
        : splitName.firstName;

  const lastName =
    typeof metadata.last_name === "string" && metadata.last_name.trim()
      ? metadata.last_name.trim()
      : typeof metadata.family_name === "string" && metadata.family_name.trim()
        ? metadata.family_name.trim()
        : splitName.lastName;

  const phone = typeof metadata.phone === "string" ? metadata.phone.trim() : "";
  const avatarUrl =
    typeof metadata.avatar_url === "string" && metadata.avatar_url.trim()
      ? metadata.avatar_url.trim()
      : typeof metadata.picture === "string" && metadata.picture.trim()
        ? metadata.picture.trim()
        : "";

  return {
    firstName,
    lastName,
    phone,
    fullName: `${firstName} ${lastName}`.trim() || (typeof fullName === "string" ? fullName.trim() : ""),
    avatarUrl,
  };
}

export function needsGoogleProfileCompletion(user: User | null): boolean {
  if (!user) return false;

  const provider = user.app_metadata?.provider;
  if (provider !== "google") return false;

  const profile = getGoogleProfileFields(user);
  return !profile.firstName || !profile.lastName || !profile.phone;
}
