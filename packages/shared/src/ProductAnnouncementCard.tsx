import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

function playAnnouncementTone() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextConstructor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    oscillator.addEventListener("ended", () => { void context.close(); }, { once: true });
  } catch {
    // Browsers can reject audio before the user has interacted with the page.
  }
}

function AnnouncementCard({
  announcement,
  onDismiss,
  onActivate,
  interactive = true,
}: {
  announcement: ProductAnnouncement;
  onDismiss: () => void;
  onActivate: () => void;
  interactive?: boolean;
}) {
  return (
    <aside
      role="status"
      aria-label={`Product announcement: ${announcement.title}`}
      aria-hidden={!interactive}
      className="pointer-events-auto relative flex h-[18rem] min-h-[18rem] w-full shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#D5C5EB] bg-[#EEE5F8] text-[#2E1F4E] shadow-[0_20px_44px_rgba(46,31,78,0.24)]"
      style={{
        backgroundColor: "#EEE5F8",
        backgroundImage: "linear-gradient(145deg, #F3ECFB 0%, #E9DDF7 100%)",
        height: "288px",
        minHeight: "288px",
        opacity: 1,
        width: "100%",
      }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[#F4C84E]/25" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-[#E9DDF7]/70" />
      <div className="relative flex min-h-0 flex-1 flex-col px-[22px] pb-[18px] pt-[22px]">
        <button
          type="button"
          onClick={onDismiss}
          tabIndex={interactive ? 0 : -1}
          aria-label={`Dismiss ${announcement.title}`}
          className="absolute right-3.5 top-3.5 rounded-md p-1 text-[#6E6381] transition hover:bg-[#2E1F4E]/[0.06] hover:text-[#2E1F4E]"
        >
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>
        <div className="mb-2 flex items-center gap-2 pr-7">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F4C84E] text-base text-[#2E1F4E]" aria-hidden="true">
            {announcement.icon === "sparkles" ? "✦" : "!"}
          </span>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#765B12]">What's new</p>
        </div>
        <h2 className="mb-2 pr-7 text-[17px] font-semibold leading-[1.3]">{announcement.title}</h2>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-[13.5px] leading-[1.55] text-[#6E6381]">
          <p className="font-medium text-[#463A5C]">{announcement.summary}</p>
          {announcement.body && <p className="mt-2 whitespace-pre-wrap">{announcement.body}</p>}
        </div>
        {announcement.cta_url && announcement.cta_label && isSafeCtaUrl(announcement.cta_url) && (
          <button
            type="button"
            onClick={onActivate}
            tabIndex={interactive ? 0 : -1}
            className="mt-3 inline-flex w-fit items-center rounded-full bg-[#2E1F4E] px-5 py-[9px] text-[13.5px] font-semibold text-white transition hover:bg-[#402966]"
          >
            {announcement.cta_label} <span className="ml-1.5" aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </aside>
  );
}

export function ProductAnnouncementCard({ client, platform, onNavigate }: ProductAnnouncementCardProps) {
  const [announcements, setAnnouncements] = useState<ProductAnnouncement[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);
  const knownAnnouncementIdsRef = useRef<Set<string>>(new Set());
  const viewedRef = useRef<Set<string>>(new Set());

  const loadAnnouncement = useCallback(async () => {
    if (typeof client.auth?.getUser !== "function") {
      setLoading(false);
      return;
    }
    const { data: authData } = await client.auth.getUser();
    const currentUserId = authData.user?.id ?? null;
    setUserId(currentUserId);
    if (!currentUserId) {
      setAnnouncements([]);
      setLoading(false);
      return;
    }

    const now = new Date().toISOString();
    const [{ data: announcementRows, error: announcementsError }, { data: events, error: eventsError }] = await Promise.all([
      client
        .from("product_announcements")
        .select("id,title,summary,body,icon,cta_label,cta_url,platforms,status,publish_at,expires_at")
        .in("status", ["published", "scheduled"])
        // Published-now announcements may intentionally have a null publish_at.
        .or(`publish_at.is.null,publish_at.lte.${now}`)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("publish_at", { ascending: false })
        .limit(10),
      client
        .from("product_announcement_events")
        .select("announcement_id,event_type")
        .eq("user_id", currentUserId)
        .eq("event_type", "dismissed"),
    ]);

    if (announcementsError) console.error("Could not load product announcements", announcementsError);
    if (eventsError) console.error("Could not load product announcement events", eventsError);

    const dismissedIds = new Set((events ?? []).map((event: { announcement_id: string }) => event.announcement_id));
    const nextAnnouncements = ((announcementRows ?? []) as ProductAnnouncement[])
      .filter((item) => Array.isArray(item.platforms) && item.platforms.includes(platform))
      .filter((item) => !dismissedIds.has(item.id));
    const hasNewAnnouncement = loadedRef.current
      && nextAnnouncements.some((item) => !knownAnnouncementIdsRef.current.has(item.id));
    if (hasNewAnnouncement) playAnnouncementTone();
    knownAnnouncementIdsRef.current = new Set(nextAnnouncements.map((item) => item.id));
    loadedRef.current = true;
    setAnnouncements(nextAnnouncements);
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
    if (!userId) return;
    for (const announcement of announcements) {
      if (viewedRef.current.has(announcement.id)) continue;
      viewedRef.current.add(announcement.id);
      void recordEvent(client, announcement.id, userId, "viewed");
    }
  }, [announcements, client, userId]);

  const dismiss = (announcement: ProductAnnouncement) => {
    if (!userId) return;
    setAnnouncements((current) => current.filter((item) => item.id !== announcement.id));
    void recordEvent(client, announcement.id, userId, "dismissed");
  };

  const activateCta = (announcement: ProductAnnouncement) => {
    if (!userId || !announcement.cta_url || !isSafeCtaUrl(announcement.cta_url)) return;
    void recordEvent(client, announcement.id, userId, "clicked");
    if (announcement.cta_url.startsWith("/") && !announcement.cta_url.startsWith("//")) {
      onNavigate(announcement.cta_url);
    } else {
      window.open(announcement.cta_url, "_blank", "noopener,noreferrer");
    }
  };

  if (loading || !announcements.length) return null;

  const collapsedAnnouncements = announcements.slice(0, 3);
  const displayedAnnouncements = expanded ? announcements : collapsedAnnouncements;
  const collapsedHeight = 288 + Math.max(0, collapsedAnnouncements.length - 1) * 12;

  const toggleStack = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    setExpanded((current) => !current);
  };

  const overlay = (
    <div
      aria-label="Product announcements"
      className="pointer-events-none fixed left-4 right-4 top-[calc(4rem+env(safe-area-inset-top))] z-[100000] flex max-h-[calc(100dvh-5.5rem)] w-auto flex-col gap-3 overflow-y-auto sm:left-auto sm:right-6 sm:top-24 sm:max-h-[calc(100dvh-7rem)]"
      style={{
        isolation: "isolate",
        opacity: 1,
        width: "min(360px, calc(100vw - 32px))",
      }}
    >
      <div
        className="pointer-events-auto relative w-full cursor-pointer rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-[#F4C84E] focus-visible:ring-offset-2"
        style={{ height: expanded ? "auto" : `${collapsedHeight}px` }}
        tabIndex={0}
        role="group"
        aria-label={`${announcements.length} product announcement${announcements.length === 1 ? "" : "s"}`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocusCapture={() => setExpanded(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
        }}
        onClick={toggleStack}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
      >
        {displayedAnnouncements.map((announcement, index) => {
          const isCollapsedCard = !expanded;
          return (
            <div
              key={announcement.id}
              aria-hidden={isCollapsedCard && index > 0}
              className={isCollapsedCard ? "absolute inset-x-0 top-0 transition-[transform,opacity] duration-200 ease-out" : "relative transition-[transform,opacity] duration-200 ease-out"}
              style={isCollapsedCard ? {
                zIndex: displayedAnnouncements.length - index,
                transform: `translateY(${index * 12}px) scale(${1 - index * 0.025})`,
                opacity: index === 0 ? 1 : 0.92,
                pointerEvents: index === 0 ? "auto" : "none",
              } : { zIndex: displayedAnnouncements.length - index }}
            >
              <AnnouncementCard
                announcement={announcement}
                interactive={expanded || index === 0}
                onDismiss={() => dismiss(announcement)}
                onActivate={() => activateCta(announcement)}
              />
            </div>
          );
        })}
        {!expanded && announcements.length > 3 && (
          <p className="pointer-events-none absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#EEE5F8] px-3 py-1 text-center text-xs text-[#6E6381] shadow-lg">
            +{announcements.length - 3} more announcement{announcements.length - 3 === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
