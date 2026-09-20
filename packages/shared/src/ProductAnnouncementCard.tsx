import { useCallback, useEffect, useRef, useState } from "react";

export type ProductAnnouncementPlatform = "salon_admin" | "client_portal" | "backoffice";

export interface ProductAnnouncement {
  id: string;
  title: string;
  summary: string;
  body: string | null;
  icon: string;
  cta_label: string | null;
  cta_url: string | null;
  platforms: string[];
  status: string;
  publish_at: string | null;
  expires_at: string | null;
}

interface AnnouncementClient {
  auth?: {
    getUser?: () => Promise<{ data: { user: { id: string } | null } }>;
  };
  from: (table: string) => any;
  channel?: (name: string) => any;
}

interface ProductAnnouncementCardProps {
  client: AnnouncementClient;
  platform: ProductAnnouncementPlatform;
  onNavigate: (path: string) => void;
}

function isSafeCtaUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function recordEvent(client: AnnouncementClient, announcementId: string, userId: string, eventType: string) {
  // Events are append-only with a unique key. A duplicate is expected when a
  // user revisits an announcement, so it is deliberately non-blocking.
  await client.from("product_announcement_events").insert({
    announcement_id: announcementId,
    user_id: userId,
    event_type: eventType,
  });
}

export function ProductAnnouncementCard({ client, platform, onNavigate }: ProductAnnouncementCardProps) {
  const [announcement, setAnnouncement] = useState<ProductAnnouncement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const viewedRef = useRef<string | null>(null);

  const loadAnnouncement = useCallback(async () => {
    if (typeof client.auth?.getUser !== "function") {
      setLoading(false);
      return;
    }
    const { data: authData } = await client.auth.getUser();
    const currentUserId = authData.user?.id ?? null;
    setUserId(currentUserId);
    if (!currentUserId) {
      setAnnouncement(null);
      setLoading(false);
      return;
    }

    const now = new Date().toISOString();
    const [{ data: announcements }, { data: events }] = await Promise.all([
      client
        .from("product_announcements")
        .select("id,title,summary,body,icon,cta_label,cta_url,platforms,status,publish_at,expires_at")
        .in("status", ["published", "scheduled"])
        .contains("platforms", [platform])
        .lte("publish_at", now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("publish_at", { ascending: false })
        .limit(10),
      client
        .from("product_announcement_events")
        .select("announcement_id,event_type")
        .eq("user_id", currentUserId)
        .eq("event_type", "dismissed"),
    ]);

    const dismissedIds = new Set((events ?? []).map((event: { announcement_id: string }) => event.announcement_id));
    const next = ((announcements ?? []) as ProductAnnouncement[]).find((item) => !dismissedIds.has(item.id)) ?? null;
    setAnnouncement(next);
    setDismissed(false);
    setLoading(false);
  }, [client, platform]);

  useEffect(() => {
    void loadAnnouncement();
    const handleFocus = () => { void loadAnnouncement(); };
    window.addEventListener("focus", handleFocus);

    const channel = client.channel?.(`product-announcements-${platform}`)
      ?.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "product_announcements",
      }, () => { void loadAnnouncement(); })
      ?.subscribe();

    return () => {
      window.removeEventListener("focus", handleFocus);
      channel?.unsubscribe?.();
    };
  }, [client, loadAnnouncement, platform]);

  useEffect(() => {
    if (!announcement || !userId || viewedRef.current === announcement.id) return;
    viewedRef.current = announcement.id;
    void recordEvent(client, announcement.id, userId, "viewed");
  }, [announcement, client, userId]);

  const dismiss = () => {
    if (!announcement || !userId) return;
    setDismissed(true);
    void recordEvent(client, announcement.id, userId, "dismissed");
  };

  const activateCta = () => {
    if (!announcement || !userId || !announcement.cta_url || !isSafeCtaUrl(announcement.cta_url)) return;
    void recordEvent(client, announcement.id, userId, "clicked");
    if (announcement.cta_url.startsWith("/") && !announcement.cta_url.startsWith("//")) {
      onNavigate(announcement.cta_url);
    } else {
      window.open(announcement.cta_url, "_blank", "noopener,noreferrer");
    }
  };

  if (loading || dismissed || !announcement) return null;

  return (
    <aside
      role="status"
      aria-label="Product announcement"
      className="fixed bottom-5 right-5 z-[70] w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#eadff9] bg-white shadow-[0_18px_55px_rgba(46,31,78,0.22)]"
    >
      <div className="flex items-start gap-3 bg-[#2e1f4e] px-4 py-3 text-white">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4c84e] text-lg" aria-hidden="true">
          {announcement.icon === "sparkles" ? "✦" : "!"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f4c84e]">What's new</p>
          <h2 className="mt-0.5 text-base font-semibold leading-tight">{announcement.title}</h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="rounded-md px-2 py-1 text-xl leading-none text-white/70 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>
      <div className="space-y-3 px-4 py-4">
        <p className="text-sm font-medium text-[#2e1f4e]">{announcement.summary}</p>
        {announcement.body && <p className="whitespace-pre-wrap text-sm leading-5 text-muted-foreground">{announcement.body}</p>}
        {announcement.cta_url && announcement.cta_label && isSafeCtaUrl(announcement.cta_url) && (
          <button
            type="button"
            onClick={activateCta}
            className="inline-flex items-center rounded-lg bg-[#f4c84e] px-3.5 py-2 text-sm font-semibold text-[#2e1f4e] transition hover:brightness-95"
          >
            {announcement.cta_label} <span className="ml-1.5" aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </aside>
  );
}
