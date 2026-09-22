import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
    onAuthStateChange?: (
      callback: (_event: string, session: { user: { id: string } | null } | null) => void,
    ) => { data: { subscription: { unsubscribe: () => void } } };
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
  // user revisits an announcement or multiple tabs load at once. onConflict/
  // ignoreDuplicates are upsert-only options — insert() silently ignores them
  // (the loosely-typed client above can't catch the mismatch), which is why
  // a genuine duplicate used to surface as a raw, unhandled Postgres 409
  // instead of being ignored.
  await client.from("product_announcement_events").upsert({
    announcement_id: announcementId,
    user_id: userId,
    event_type: eventType,
  }, { onConflict: "announcement_id,user_id,event_type", ignoreDuplicates: true });
}

function playAnnouncementTone() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextConstructor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const play = () => {
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
    };

    // A context created outside a user gesture starts suspended in many
    // browsers. Resume it immediately when possible, then retry on the next
    // interaction so a newly published card can still announce itself.
    if (context.state === "suspended") {
      let resolved = false;
      const unlock = () => {
        if (resolved) return;
        resolved = true;
        void context.resume().then(play).catch(() => { void context.close(); });
      };
      window.addEventListener("pointerdown", unlock, { once: true, passive: true });
      window.addEventListener("keydown", unlock, { once: true });
      void context.resume().then(() => {
        if (!resolved && context.state === "running") unlock();
      }).catch(() => undefined);
      window.setTimeout(() => {
        if (!resolved) {
          resolved = true;
          void context.close();
        }
      }, 5000);
      return;
    }
    play();
  } catch {
    // Browsers can reject audio before the user has interacted with the page.
  }
}

function AnnouncementIcon({ icon }: { icon: string }) {
  return <>{icon === "sparkles" ? "✦" : "!"}</>;
}

/** Small floating trigger, always present once there's anything to show — the
 * single anchor point for both the revisit list (dropdown) and a genuinely
 * new announcement's spotlight (modal). Fixed rather than woven into each
 * app's own header markup so one component keeps working unmodified across
 * three different header layouts. */
function AnnouncementTrigger({
  hasUnseen,
  open,
  onToggle,
}: {
  hasUnseen: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={hasUnseen ? "What's new — new announcement" : "What's new"}
      className="pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#2E1F4E] text-[#F4C84E] shadow-[0_10px_28px_rgba(46,31,78,0.35)] transition hover:bg-[#3a2760] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4C84E] focus-visible:ring-offset-2"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
      </svg>
      {hasUnseen && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#2E1F4E] bg-[#FF5A5F]"
        />
      )}
    </button>
  );
}

function AnnouncementDropdown({
  announcements,
  onSelect,
  onClose,
}: {
  announcements: ProductAnnouncement[];
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="menu"
      aria-label="What's new"
      className="pointer-events-auto absolute right-0 top-[calc(100%+10px)] w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-[16px] border border-[#EDE6F5] bg-white shadow-[0_20px_44px_rgba(46,31,78,0.22)]"
    >
      <div className="flex items-center justify-between border-b border-[#F1ECF9] px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#765B12]">What's new</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-[#9A90A8] transition hover:bg-[#F3EEFA] hover:text-[#2E1F4E]"
        >
          <span aria-hidden="true" className="text-base leading-none">×</span>
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto py-1.5">
        {announcements.map((announcement, index) => (
          <button
            key={announcement.id}
            type="button"
            role="menuitem"
            onClick={() => onSelect(index)}
            className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition hover:bg-[#F8F4FC]"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-[#2E1F4E]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#F4C84E]/25 text-[10px] text-[#765B12]" aria-hidden="true">
                <AnnouncementIcon icon={announcement.icon} />
              </span>
              {announcement.title}
            </span>
            <span className="line-clamp-2 pl-7 text-[12px] leading-snug text-[#6E6381]">{announcement.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnnouncementModal({
  announcements,
  index,
  onIndexChange,
  onDismiss,
  onActivate,
  onClose,
}: {
  announcements: ProductAnnouncement[];
  index: number;
  onIndexChange: (next: number) => void;
  onDismiss: (announcement: ProductAnnouncement) => void;
  onActivate: (announcement: ProductAnnouncement) => void;
  onClose: () => void;
}) {
  const announcement = announcements[index];
  const isLast = index === announcements.length - 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!announcement) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Product announcement: ${announcement.title}`}
      className="pointer-events-auto fixed inset-0 z-[100001] flex items-center justify-center bg-[#1A1035]/55 p-4 backdrop-blur-[2px]"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[22px] border border-[#F0E6C8] bg-[#FFFCF6] p-7 text-[#2E1F4E] shadow-[0_30px_60px_rgba(26,16,53,0.35)]">
        <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#F4C84E]/35" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-14 -left-10 h-32 w-32 rounded-full bg-[#2E1F4E]/5" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-[#9A8F6E] transition hover:bg-[#2E1F4E]/[0.06] hover:text-[#2E1F4E]"
        >
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>

        <div className="relative flex flex-col">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2E1F4E] text-lg text-[#F4C84E]" aria-hidden="true">
            <AnnouncementIcon icon={announcement.icon} />
          </span>

          <h2 className="mb-2 pr-6 text-[19px] font-semibold leading-[1.3]">{announcement.title}</h2>
          <div className="max-h-[38vh] overflow-y-auto pr-1 text-[13.5px] leading-[1.6] text-[#7A6F55]">
            <p className="font-medium">{announcement.summary}</p>
            {announcement.body && <p className="mt-2 whitespace-pre-wrap text-[#7A6F55]">{announcement.body}</p>}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onDismiss(announcement)}
              className="text-[12.5px] font-semibold text-[#9A8F6E] transition hover:text-[#2E1F4E]"
            >
              Don't show this again
            </button>
            {announcement.cta_url && announcement.cta_label && isSafeCtaUrl(announcement.cta_url) && (
              <button
                type="button"
                onClick={() => onActivate(announcement)}
                className="inline-flex shrink-0 items-center rounded-full bg-[#F4C84E] px-5 py-2 text-[13px] font-semibold text-[#2E1F4E] transition hover:bg-[#e9bb3d]"
              >
                {announcement.cta_label} <span className="ml-1.5" aria-hidden="true">→</span>
              </button>
            )}
          </div>

          {announcements.length > 1 && (
            <div className="mt-5 flex items-center justify-between border-t border-[#F0E6C8] pt-4">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {announcements.map((item, dotIndex) => (
                  <span
                    key={item.id}
                    className={
                      dotIndex === index
                        ? "h-1.5 w-4 rounded-full bg-[#2E1F4E]"
                        : "h-1.5 w-1.5 rounded-full bg-[#2E1F4E]/25"
                    }
                  />
                ))}
              </div>
              <div className="flex items-center gap-3 text-[12.5px] font-semibold">
                <button
                  type="button"
                  onClick={() => onIndexChange(index - 1)}
                  disabled={index === 0}
                  className="text-[#9A8F6E] transition hover:text-[#2E1F4E] disabled:pointer-events-none disabled:opacity-30"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => (isLast ? onClose() : onIndexChange(index + 1))}
                  className="text-[#2E1F4E] transition hover:opacity-70"
                >
                  {isLast ? "Done" : "Next →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProductAnnouncementCard({ client, platform, onNavigate }: ProductAnnouncementCardProps): ReactNode {
  const [announcements, setAnnouncements] = useState<ProductAnnouncement[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"closed" | "dropdown" | "modal">("closed");
  const [modalIndex, setModalIndex] = useState(0);
  const [hasUnseen, setHasUnseen] = useState(false);
  const loadedRef = useRef(false);
  const knownAnnouncementIdsRef = useRef<Set<string>>(new Set());
  const viewedRef = useRef<Set<string>>(new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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
        // Date eligibility is filtered below. Keeping it out of the chained
        // PostgREST filters avoids one `.or()` replacing another in older
        // Supabase clients, and preserves announcements with a null publish_at.
        .order("publish_at", { ascending: false, nullsFirst: false })
        .limit(50),
      client
        .from("product_announcement_events")
        .select("announcement_id,event_type")
        .eq("user_id", currentUserId),
    ]);

    if (announcementsError) console.error("Could not load product announcements", announcementsError);
    if (eventsError) console.error("Could not load product announcement events", eventsError);

    const dismissedIds = new Set(
      (events ?? [])
        .filter((event: { event_type: string }) => event.event_type === "dismissed")
        .map((event: { announcement_id: string }) => event.announcement_id),
    );
    const viewedIds = new Set(
      (events ?? [])
        .filter((event: { event_type: string }) => event.event_type === "viewed")
        .map((event: { announcement_id: string }) => event.announcement_id),
    );
    const nowMs = Date.parse(now);
    const nextAnnouncements = ((announcementRows ?? []) as ProductAnnouncement[])
      .filter((item) => {
        const publishAt = item.publish_at ? Date.parse(item.publish_at) : Number.NEGATIVE_INFINITY;
        const expiresAt = item.expires_at ? Date.parse(item.expires_at) : Number.POSITIVE_INFINITY;
        return publishAt <= nowMs && expiresAt > nowMs;
      })
      .filter((item) => Array.isArray(item.platforms) && item.platforms.includes(platform))
      .filter((item) => !dismissedIds.has(item.id));

    const newIndex = loadedRef.current
      ? nextAnnouncements.findIndex((item) => !knownAnnouncementIdsRef.current.has(item.id) && !viewedIds.has(item.id))
      : nextAnnouncements.findIndex((item) => !viewedIds.has(item.id));
    const hasNewAnnouncement = newIndex !== -1;

    if (hasNewAnnouncement) {
      playAnnouncementTone();
      setHasUnseen(true);
      // A genuinely new announcement gets its moment as a spotlight — once.
      // Anything already seen or dismissed only ever lives behind the header
      // icon, so revisiting the list never re-triggers this.
      setModalIndex(newIndex);
      setPanel("modal");
    } else if (nextAnnouncements.length === 0) {
      setHasUnseen(false);
    }

    knownAnnouncementIdsRef.current = new Set(nextAnnouncements.map((item) => item.id));
    loadedRef.current = true;
    setAnnouncements(nextAnnouncements);
    setLoading(false);
  }, [client, platform]);

  useEffect(() => {
    void loadAnnouncement();
    const handleFocus = () => { void loadAnnouncement(); };
    window.addEventListener("focus", handleFocus);
    const authSubscription = client.auth?.onAuthStateChange?.((_event, session) => {
      // Supabase can restore INITIAL_SESSION after this component mounted. A
      // deferred reload prevents the card from remaining empty after that
      // first unauthenticated read, and avoids calling Supabase inside its
      // auth callback stack.
      window.setTimeout(() => {
        if (!session?.user) {
          setUserId(null);
          setAnnouncements([]);
          setLoading(false);
          return;
        }
        void loadAnnouncement();
      }, 0);
    });

    const channel = client.channel?.(`product-announcements-${platform}`)
      ?.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "product_announcements",
      }, () => { void loadAnnouncement(); })
      ?.subscribe();

    return () => {
      window.removeEventListener("focus", handleFocus);
      authSubscription?.data.subscription.unsubscribe();
      channel?.unsubscribe?.();
    };
  }, [client, loadAnnouncement, platform]);

  useEffect(() => {
    const onOutsideClick = (event: MouseEvent) => {
      if (panel === "dropdown" && wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setPanel("closed");
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [panel]);

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
    const remaining = announcements.filter((item) => item.id !== announcement.id);
    setAnnouncements(remaining);
    void recordEvent(client, announcement.id, userId, "dismissed");
    if (remaining.length === 0) {
      setPanel("closed");
    } else if (panel === "modal") {
      setModalIndex((current) => Math.min(current, remaining.length - 1));
    }
  };

  const activateCta = (announcement: ProductAnnouncement) => {
    if (!userId || !announcement.cta_url || !isSafeCtaUrl(announcement.cta_url)) return;
    void recordEvent(client, announcement.id, userId, "clicked");
    setPanel("closed");
    if (announcement.cta_url.startsWith("/") && !announcement.cta_url.startsWith("//")) {
      onNavigate(announcement.cta_url);
    } else {
      window.open(announcement.cta_url, "_blank", "noopener,noreferrer");
    }
  };

  const openDropdown = () => {
    setPanel((current) => (current === "dropdown" ? "closed" : "dropdown"));
    setHasUnseen(false);
  };

  const openModalAt = (index: number) => {
    setModalIndex(index);
    setPanel("modal");
    setHasUnseen(false);
  };

  if (loading || !announcements.length) return null;
  // Ephemeral, not a persistent inbox: the trigger only exists while there's
  // something unseen to surface, or while its own panel is open. It must
  // never compete with each app's own header icons (notification bell,
  // avatar) for the same corner, so it sits well clear of any real header —
  // the tallest of the three apps' headers is 80px (client-portal desktop).
  if (!hasUnseen && panel === "closed") return null;

  const overlay = (
    <div
      ref={wrapperRef}
      aria-label="Product announcements"
      className="pointer-events-none fixed right-4 z-[100000]"
      style={{ top: "calc(5.5rem + env(safe-area-inset-top))" }}
    >
      <AnnouncementTrigger hasUnseen={hasUnseen} open={panel === "dropdown"} onToggle={openDropdown} />
      {panel === "dropdown" && (
        <AnnouncementDropdown
          announcements={announcements}
          onSelect={openModalAt}
          onClose={() => setPanel("closed")}
        />
      )}
      {panel === "modal" && (
        <AnnouncementModal
          announcements={announcements}
          index={Math.min(modalIndex, announcements.length - 1)}
          onIndexChange={setModalIndex}
          onDismiss={dismiss}
          onActivate={activateCta}
          onClose={() => setPanel("closed")}
        />
      )}
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
