import { useRef, useState } from "react";
import {
  Camera,
  Check,
  Clock,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  Pencil,
  Phone,
  Plus,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
  X,
  ZoomIn,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@ui/ui/use-toast";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Staff",
};

const CROP_SIZE = 200;
const CANVAS_SIZE = 400;

interface MyProfileModalProps {
  open: boolean;
  onClose: () => void;
}

interface SessionRow {
  id: string;
  user_id: string;
  started_at: string;
  last_activity_at: string;
  device_type: string | null;
  browser_name: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  session_token: string | null;
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile") return <Smartphone className="w-4 h-4 shrink-0" />;
  if (type === "tablet") return <Tablet className="w-4 h-4 shrink-0" />;
  return <Monitor className="w-4 h-4 shrink-0" />;
}

function locationLabel(s: SessionRow): string {
  const parts = [s.city, s.region, s.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Unknown location";
}

export function MyProfileModal({ open, onClose }: MyProfileModalProps) {
  const { user, profile, currentRole, refreshProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── avatar crop state ──────────────────────────────────────────────────────
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const isDragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const [isUploading, setIsUploading] = useState(false);

  // ── phone edit state ───────────────────────────────────────────────────────
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // ── sessions state ─────────────────────────────────────────────────────────
  const [confirmSessionId, setConfirmSessionId] = useState<string | null>(null);
  const currentSessionId = sessionStorage.getItem("staff_session_id");

  const { data: mySessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["my-profile-sessions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("staff_sessions")
        .select(
          "id, user_id, started_at, last_activity_at, device_type, browser_name, city, country, region, session_token",
        )
        .eq("user_id", user.id)
        .is("ended_at", null)
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
    enabled: !!user?.id && open,
    refetchInterval: 60_000,
  });

  const revokeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.functions.invoke("revoke-staff-session", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile-sessions", user?.id] });
      setConfirmSessionId(null);
      toast({ title: "Session ended" });
    },
    onError: () => {
      toast({ title: "Failed to end session", variant: "destructive" });
    },
  });

  // ── derived ────────────────────────────────────────────────────────────────
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  // ── avatar handlers ────────────────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setCropFile(f);
    setCropUrl(url);
    setCropScale(1);
    setCropOffset({ x: 0, y: 0 });
    setNaturalSize(null);
    e.target.value = "";
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setCropOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }

  function handlePointerUp() {
    isDragging.current = false;
  }

  async function generateCroppedBlob(): Promise<Blob> {
    const img = new Image();
    img.src = cropUrl!;
    await new Promise<void>((resolve) => { img.onload = () => resolve(); });
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, 2 * Math.PI);
    ctx.clip();
    const coverFit = CROP_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
    const ratio = CANVAS_SIZE / CROP_SIZE;
    const rw = img.naturalWidth * coverFit * cropScale * ratio;
    const rh = img.naturalHeight * coverFit * cropScale * ratio;
    const cx = (CROP_SIZE / 2 + cropOffset.x) * ratio;
    const cy = (CROP_SIZE / 2 + cropOffset.y) * ratio;
    ctx.drawImage(img, cx - rw / 2, cy - rh / 2, rw, rh);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Canvas export failed")), "image/jpeg", 0.92);
    });
  }

  async function handleSaveAvatar() {
    if (!user?.id || !cropFile) return;
    setIsUploading(true);
    try {
      const blob = await generateCroppedBlob();
      const path = `profile-pictures/${user.id}-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("salon-branding")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("salon-branding").getPublicUrl(path);
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("user_id", user.id);
      if (updateErr) throw updateErr;
      await refreshProfile();
      setCropUrl(null);
      setCropFile(null);
      toast({ title: "Profile picture updated" });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  function handleDiscard() {
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropUrl(null);
    setCropFile(null);
  }

  // ── phone handlers ─────────────────────────────────────────────────────────
  function startEditPhone() {
    setPhoneInput(profile?.phone ?? "");
    setEditingPhone(true);
  }

  function cancelEditPhone() {
    setEditingPhone(false);
    setPhoneInput("");
  }

  async function handleSavePhone() {
    if (!user?.id) return;
    const trimmed = phoneInput.trim();
    if (trimmed && !/^\+[1-9]\d{7,14}$/.test(trimmed)) {
      toast({ title: "Invalid phone number", description: "Enter a full international number (e.g. +2348012345678).", variant: "destructive" });
      return;
    }
    setIsSavingPhone(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ phone: trimmed || null })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      setEditingPhone(false);
      toast({ title: "Phone number updated" });
    } catch {
      toast({ title: "Failed to update phone", variant: "destructive" });
    } finally {
      setIsSavingPhone(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { handleDiscard(); cancelEditPhone(); onClose(); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        {cropUrl ? (
          /* ── Crop view ── */
          <div className="flex flex-col items-center gap-4 py-1">
            <p className="text-xs text-muted-foreground">Drag to reposition · scroll to zoom</p>
            <div
              className="relative overflow-hidden rounded-full border-2 border-primary cursor-grab active:cursor-grabbing select-none"
              style={{ width: CROP_SIZE, height: CROP_SIZE }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={(e) => {
                e.preventDefault();
                setCropScale((s) => Math.min(4, Math.max(0.5, s - e.deltaY * 0.002)));
              }}
            >
              <img
                src={cropUrl}
                draggable={false}
                className="absolute max-w-none"
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                  setNaturalSize({ w, h });
                }}
                style={(() => {
                  if (!naturalSize) return { opacity: 0, position: "absolute" as const };
                  const coverFit = CROP_SIZE / Math.min(naturalSize.w, naturalSize.h);
                  const displayW = naturalSize.w * coverFit;
                  const displayH = naturalSize.h * coverFit;
                  return {
                    position: "absolute" as const,
                    width: displayW,
                    height: displayH,
                    top: "50%",
                    left: "50%",
                    transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropScale})`,
                    transformOrigin: "center",
                  };
                })()}
              />
            </div>
            <div className="flex w-full items-center gap-2">
              <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="range" min={0.5} max={4} step={0.05} value={cropScale}
                onChange={(e) => setCropScale(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={handleDiscard} disabled={isUploading}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSaveAvatar} disabled={isUploading}>
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save photo
              </Button>
            </div>
          </div>
        ) : (
          /* ── Tabs view ── */
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
              <TabsTrigger value="sessions" className="flex-1 gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Sessions
              </TabsTrigger>
            </TabsList>

            {/* ── Profile tab ── */}
            <TabsContent value="profile" className="mt-0">
              <div className="flex flex-col items-center gap-4 py-1">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="h-5 w-5 text-white" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
                <p className="text-xs text-muted-foreground -mt-2">Tap photo to change</p>

                <div className="w-full divide-y rounded-lg border">
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted-foreground mb-0.5">Name</p>
                    <p className="text-sm font-medium">{displayName}</p>
                  </div>

                  {user?.email && (
                    <div className="px-4 py-3">
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> Email
                      </p>
                      <p className="text-sm">{user.email}</p>
                    </div>
                  )}

                  {/* Phone — editable */}
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Phone
                    </p>
                    {editingPhone ? (
                      <div className="mt-2 space-y-2">
                        <AuthPhoneInput
                          label=""
                          value={phoneInput}
                          onChange={setPhoneInput}
                          disabled={isSavingPhone}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={cancelEditPhone}
                            disabled={isSavingPhone}
                          >
                            <X className="w-3.5 h-3.5 mr-1" /> Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={handleSavePhone}
                            disabled={isSavingPhone}
                          >
                            {isSavingPhone
                              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              : <Check className="w-3.5 h-3.5 mr-1" />}
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : profile?.phone ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm">{profile.phone}</p>
                        <button
                          type="button"
                          onClick={startEditPhone}
                          className="text-muted-foreground hover:text-foreground transition-colors ml-2"
                          title="Update phone number"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={startEditPhone}
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-0.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add phone number
                      </button>
                    )}
                  </div>

                  {currentRole && (
                    <div className="px-4 py-3">
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Role
                      </p>
                      <Badge variant="secondary" className="mt-0.5">
                        {ROLE_LABELS[currentRole] ?? currentRole}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── Sessions tab ── */}
            <TabsContent value="sessions" className="mt-0">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Your active sign-in sessions across all devices. End any session you don't recognise.
                </p>

                {sessionsLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Loading sessions…</div>
                ) : mySessions.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No active sessions found.</div>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {mySessions.map((s) => {
                      const isCurrent = s.session_token === currentSessionId || s.id === currentSessionId;
                      return (
                        <div key={s.id} className="flex items-start gap-3 px-4 py-3">
                          <div className="mt-0.5 text-muted-foreground">
                            <DeviceIcon type={s.device_type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">
                              {[s.device_type === "mobile" ? "Mobile" : s.device_type === "tablet" ? "Tablet" : "Desktop", s.browser_name].filter(Boolean).join(" · ")}
                              {isCurrent && (
                                <Badge variant="secondary" className="ml-2 text-[10px] py-0 h-4">
                                  This device
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              {formatDistanceToNow(new Date(s.last_activity_at), { addSuffix: true })}
                              {locationLabel(s) !== "Unknown location" && (
                                <span className="ml-1">· {locationLabel(s)}</span>
                              )}
                            </p>
                          </div>
                          {!isCurrent && (
                            <button
                              type="button"
                              title="End this session"
                              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                              onClick={() => setConfirmSessionId(s.id)}
                            >
                              <LogOut className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>

      {/* Revoke confirmation */}
      <AlertDialog open={!!confirmSessionId} onOpenChange={(o) => { if (!o) setConfirmSessionId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>
              The device signed in with this session will be logged out immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSessionId && revokeMutation.mutate(confirmSessionId)}
              disabled={revokeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending ? "Ending…" : "End session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
