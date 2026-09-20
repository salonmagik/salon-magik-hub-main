import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ExternalLink, History, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks/useBackofficeAuth";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import { Checkbox } from "@ui/checkbox";
import { Alert, AlertDescription } from "@ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ui/alert-dialog";
import { toast } from "sonner";

type Platform = "salon_admin" | "client_portal" | "backoffice";
type Status = "draft" | "scheduled" | "published" | "archived";

interface Announcement {
  id: string;
  title: string;
  summary: string;
  body: string | null;
  icon: string;
  cta_label: string | null;
  cta_url: string | null;
  platforms: Platform[];
  status: Status;
  publish_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Draft {
  id?: string;
  title: string;
  summary: string;
  body: string;
  icon: string;
  cta_label: string;
  cta_url: string;
  platforms: Platform[];
  status: Status;
  publish_at: string;
  expires_at: string;
}

const emptyDraft: Draft = {
  title: "",
  summary: "",
  body: "",
  icon: "sparkles",
  cta_label: "",
  cta_url: "",
  platforms: ["salon_admin", "client_portal"],
  status: "draft",
  publish_at: "",
  expires_at: "",
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function isAllowedUrl(value: string) {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function RequiredMark() {
  return <span className="text-destructive" aria-hidden="true">*</span>;
}

export default function ProductAnnouncementsPage() {
  const queryClient = useQueryClient();
  const { session, backofficeUser } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showEditor, setShowEditor] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const announcementsQuery = useQuery({
    queryKey: ["product-announcements"],
    // Wait until Supabase has restored the backoffice session. Querying before
    // that point can cache an RLS error and leave the page stuck in the error
    // state even after authentication finishes loading.
    enabled: Boolean(session?.user.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["product-announcement-events"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_announcement_events")
        .select("announcement_id,event_type");
      if (error) throw error;
      return (data ?? []) as Array<{ announcement_id: string; event_type: string }>;
    },
    enabled: Boolean(session?.user.id && isSuperAdmin),
  });

  const eventCounts = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const event of eventsQuery.data ?? []) {
      result[event.announcement_id] ??= {};
      result[event.announcement_id][event.event_type] = (result[event.announcement_id][event.event_type] ?? 0) + 1;
    }
    return result;
  }, [eventsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (value: Draft) => {
      if (!value.title.trim() || !value.summary.trim()) throw new Error("Title and summary are required.");
      if (!value.platforms.length) throw new Error("Select at least one target platform.");
      if (!isAllowedUrl(value.cta_url.trim())) throw new Error("CTA URL must be an internal path or an http(s) URL.");
      if (value.status === "scheduled" && !value.publish_at) throw new Error("Scheduled announcements need a publish date.");
      const publishAt = value.status === "published"
        ? (toIso(value.publish_at) ?? new Date().toISOString())
        : toIso(value.publish_at);
      if (value.status === "scheduled" && (!publishAt || new Date(publishAt) <= new Date())) {
        throw new Error("Scheduled announcements need a future publish date.");
      }
      if (value.expires_at && publishAt && new Date(value.expires_at) <= new Date(publishAt)) {
        throw new Error("Expiry must be after the publish date.");
      }

      const payload = {
        title: value.title.trim(),
        summary: value.summary.trim(),
        body: value.body.trim() || null,
        icon: value.icon.trim() || "sparkles",
        cta_label: value.cta_label.trim() || null,
        cta_url: value.cta_url.trim() || null,
        platforms: value.platforms,
        status: value.status,
        // New “Published now” announcements are timestamped at save time;
        // edits preserve the original publication time. Scheduled announcements
        // use the explicit date.
        publish_at: publishAt,
        expires_at: toIso(value.expires_at),
        updated_by_id: session?.user.id ?? null,
      };

      const query = value.id
        ? (supabase as any).from("product_announcements").update(payload).eq("id", value.id)
        : (supabase as any).from("product_announcements").insert({ ...payload, created_by_id: session?.user.id ?? null });
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(draft.status === "published" ? "Announcement published." : "Announcement saved.");
      setDraft(emptyDraft);
      setShowEditor(false);
      void queryClient.invalidateQueries({ queryKey: ["product-announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["product-announcement-events"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("product_announcements")
        .update({ status: "archived", updated_by_id: session?.user.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement archived.");
      void queryClient.invalidateQueries({ queryKey: ["product-announcements"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (announcement: Announcement) => {
      const { error } = await (supabase as any)
        .from("product_announcements")
        .delete()
        .eq("id", announcement.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement deleted.");
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["product-announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["product-announcement-events"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const edit = (announcement: Announcement) => {
    setDraft({
      id: announcement.id,
      title: announcement.title,
      summary: announcement.summary,
      body: announcement.body ?? "",
      icon: announcement.icon,
      cta_label: announcement.cta_label ?? "",
      cta_url: announcement.cta_url ?? "",
      platforms: announcement.platforms,
      status: announcement.status,
      publish_at: toLocalInput(announcement.publish_at),
      expires_at: toLocalInput(announcement.expires_at),
    });
    setShowEditor(true);
  };

  const togglePlatform = (platform: Platform, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      platforms: checked
        ? Array.from(new Set([...current.platforms, platform]))
        : current.platforms.filter((item) => item !== platform),
    }));
  };

  return (
    <BackofficeLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Product announcements</h1>
            <p className="mt-1 text-sm text-muted-foreground">Publish targeted “What’s new” cards with a direct path into the feature.</p>
          </div>
          <Button onClick={() => { setDraft(emptyDraft); setShowEditor(true); }} disabled={!isSuperAdmin}>
            <Plus className="mr-2 h-4 w-4" /> New announcement
          </Button>
        </div>

        {!isSuperAdmin && (
          <Alert><AlertDescription>Only Super Admins can create, publish, archive, or delete product announcements.</AlertDescription></Alert>
        )}

        {showEditor && (
          <Card>
            <CardHeader>
              <CardTitle>{draft.id ? "Edit announcement" : "New announcement"}</CardTitle>
              <CardDescription>Drafts stay private. Publishing makes the card visible to the selected audiences.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2"><Label>Title <RequiredMark /></Label><Input required aria-required="true" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Automated reminders are here" /></div>
              <div className="space-y-2 md:col-span-2"><Label>Summary <RequiredMark /></Label><Input required aria-required="true" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="Send timely appointment reminders automatically." /></div>
              <div className="space-y-2 md:col-span-2"><Label>Details (optional)</Label><Textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} rows={4} placeholder="Explain what changed and why it matters." /></div>
              <div className="space-y-2"><Label>CTA label</Label><Input value={draft.cta_label} onChange={(event) => setDraft({ ...draft, cta_label: event.target.value })} placeholder="Explore reminders" /></div>
              <div className="space-y-2"><Label>CTA path or URL</Label><Input value={draft.cta_url} onChange={(event) => setDraft({ ...draft, cta_url: event.target.value })} placeholder="/salon/settings/notifications" /><p className="text-xs text-muted-foreground">Use a route that exists in every selected audience, or publish separate cards for different apps.</p></div>
              {draft.status === "scheduled" ? <div className="space-y-2"><Label>Publish date <RequiredMark /></Label><Input required aria-required="true" type="datetime-local" value={draft.publish_at} onChange={(event) => setDraft({ ...draft, publish_at: event.target.value })} /><p className="text-xs text-muted-foreground">The announcement becomes visible at this time.</p></div> : <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">{draft.status === "published" ? "Published now will record the current time when you save." : "Publish date is set automatically when you choose Published now."}</div>}
              <div className="space-y-2"><Label>Expiry date (optional)</Label><Input type="datetime-local" value={draft.expires_at} onChange={(event) => setDraft({ ...draft, expires_at: event.target.value })} /><p className="text-xs text-muted-foreground">Leave blank to keep the announcement active indefinitely.</p></div>
              <div className="space-y-3"><Label>Status <RequiredMark /></Label><select aria-required="true" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">Published now</option><option value="archived">Archived</option></select></div>
              <div className="space-y-3"><Label>Audience <RequiredMark /></Label><div className="grid gap-2 text-sm">{([['salon_admin', 'Salon Admin'], ['client_portal', 'Client Portal'], ['backoffice', 'Backoffice']] as const).map(([platform, label]) => <label key={platform} className="flex items-center gap-2"><Checkbox checked={draft.platforms.includes(platform)} onCheckedChange={(checked) => togglePlatform(platform, checked === true)} /><span>{label}</span></label>)}</div><p className="text-xs text-muted-foreground">Select at least one audience.</p></div>
              <div className="flex justify-end gap-2 md:col-span-2"><Button variant="outline" onClick={() => { setShowEditor(false); setDraft(emptyDraft); }}>Cancel</Button><Button onClick={() => saveMutation.mutate(draft)} disabled={!isSuperAdmin || saveMutation.isPending}><Save className="mr-2 h-4 w-4" />{saveMutation.isPending ? "Saving…" : "Save announcement"}</Button></div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Announcement history</CardTitle><CardDescription>Published announcements remain here for audit and reuse. Leave expiry blank to keep the card available indefinitely.</CardDescription></CardHeader>
          <CardContent>
            {announcementsQuery.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading announcements…</p> : announcementsQuery.error ? <p className="py-8 text-center text-sm text-destructive">Could not load announcements.</p> : (announcementsQuery.data ?? []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No announcements yet.</p> : <div className="space-y-3">{(announcementsQuery.data ?? []).map((announcement) => { const counts = eventCounts[announcement.id] ?? {}; return <div key={announcement.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{announcement.title}</h3><Badge variant={announcement.status === "published" ? "default" : "secondary"}>{announcement.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{announcement.summary}</p><div className="mt-2 flex flex-wrap gap-1">{announcement.platforms.map((platform) => <Badge key={platform} variant="outline">{platform.replace("_", " ")}</Badge>)}<span className="text-xs text-muted-foreground">{counts.viewed ?? 0} views · {counts.clicked ?? 0} clicks · {counts.dismissed ?? 0} dismissed</span></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => edit(announcement)} disabled={!isSuperAdmin}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>{announcement.status !== "archived" && <Button variant="outline" size="sm" onClick={() => archiveMutation.mutate(announcement.id)} disabled={!isSuperAdmin || archiveMutation.isPending}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button>}<Button variant="ghost" size="icon" asChild><a href={`/audit-logs?entity_type=product_announcement&entity_id=${announcement.id}`} aria-label="View announcement history" title="View announcement history"><History className="h-4 w-4" /></a></Button>{announcement.cta_url && <Button variant="ghost" size="icon" asChild><a href={announcement.cta_url} target="_blank" rel="noreferrer" aria-label="Open CTA"><ExternalLink className="h-4 w-4" /></a></Button>}<Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(announcement)} disabled={!isSuperAdmin || deleteMutation.isPending} aria-label={`Delete ${announcement.title}`} title="Delete announcement"><Trash2 className="h-4 w-4" /></Button></div></div><p className="mt-3 text-xs text-muted-foreground">Created {new Date(announcement.created_at).toLocaleString()}{announcement.publish_at ? ` · Publish ${new Date(announcement.publish_at).toLocaleString()}` : ""}</p></div>; })}</div>}
          </CardContent>
        </Card>
      </div>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleteTarget?.title}” and its analytics events. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteTarget || deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete announcement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BackofficeLayout>
  );
}
