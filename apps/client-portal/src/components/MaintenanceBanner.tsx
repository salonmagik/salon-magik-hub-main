import { useEffect, useState, useCallback } from "react";
import { X, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { Button } from "@ui/button";

interface MaintenanceBannerSetting {
  enabled: boolean;
  mode: "immediate" | "scheduled";
  platforms: string[];
  scheduled_at: string | null;
  title: string;
  description: string;
  guidance: string;
}

function parseValue(value: Record<string, unknown> | null): MaintenanceBannerSetting | null {
  if (!value) return null;
  return {
    enabled: value.enabled === true,
    mode: value.mode === "scheduled" ? "scheduled" : "immediate",
    platforms: Array.isArray(value.platforms) ? (value.platforms as string[]) : [],
    scheduled_at: typeof value.scheduled_at === "string" ? value.scheduled_at : null,
    title: typeof value.title === "string" ? value.title : "Scheduled Maintenance",
    description: typeof value.description === "string" ? value.description : "",
    guidance: typeof value.guidance === "string" ? value.guidance : "",
  };
}

export function MaintenanceBanner() {
  const [setting, setSetting] = useState<MaintenanceBannerSetting | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "maintenance_banner")
        .maybeSingle();
      setSetting(parseValue(data?.value as Record<string, unknown> | null));
    };

    fetch();

    const channel = supabase
      .channel("client_portal_maintenance_banner")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "platform_settings",
        filter: "key=eq.maintenance_banner",
      }, fetch)
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  const handleDismiss = useCallback(() => setDismissed(true), []);

  const isVisible =
    setting?.enabled &&
    setting.platforms.includes("client_portal") &&
    !dismissed;

  if (!isVisible) return null;

  const isScheduled = setting!.mode === "scheduled";
  const scheduledAt = isScheduled && setting!.scheduled_at ? new Date(setting!.scheduled_at) : null;
  const isUpcoming = scheduledAt && scheduledAt > new Date();

  const bannerTitle = isScheduled && isUpcoming ? "Upcoming Maintenance" : setting!.title;
  const bannerMessage = isScheduled && isUpcoming
    ? `Maintenance scheduled for ${scheduledAt!.toLocaleString()}`
    : setting!.title;

  return (
    <>
      <div className="mx-4 mb-4 flex items-start gap-3 rounded-lg border border-transparent bg-[#F5F7FA] p-3 text-sm text-[#2563EB]">
        <Wrench className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{bannerTitle}</p>
          <p className="opacity-90">{bannerMessage}</p>
          <button
            type="button"
            className="mt-1 font-medium underline hover:no-underline"
            onClick={() => setModalOpen(true)}
          >
            Learn more →
          </button>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 rounded p-1 hover:bg-black/10"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-500" />
              {setting!.title}
            </DialogTitle>
          </DialogHeader>

          <div className={DIALOG_BODY_PADDING}>
          <div className="space-y-4 text-sm">
            {scheduledAt && (
              <div className="rounded-lg bg-muted px-4 py-3">
                <p className="font-medium">Scheduled for</p>
                <p className="text-muted-foreground">{scheduledAt.toLocaleString()}</p>
              </div>
            )}

            {setting!.description && (
              <div>
                <p className="font-medium mb-1">What's happening</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{setting!.description}</p>
              </div>
            )}

            {setting!.guidance && (
              <div>
                <p className="font-medium mb-1">What you should know</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{setting!.guidance}</p>
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button className="w-full" onClick={() => setModalOpen(false)}>
              Got it
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
