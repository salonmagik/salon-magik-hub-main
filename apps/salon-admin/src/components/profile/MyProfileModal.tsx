import { useRef, useState } from "react";
import { Camera, Loader2, Mail, Phone, ShieldCheck, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@ui/ui/use-toast";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Staff",
};

const CROP_SIZE = 200; // preview circle diameter in px
const CANVAS_SIZE = 400; // output canvas size

interface MyProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function MyProfileModal({ open, onClose }: MyProfileModalProps) {
  const { user, profile, currentRole, refreshProfile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Crop state
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const [isUploading, setIsUploading] = useState(false);

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setCropFile(f);
    setCropUrl(url);
    setCropScale(1);
    setCropOffset({ x: 0, y: 0 });
    // Reset input so same file can be re-selected
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

    // Clip to circle
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, 2 * Math.PI);
    ctx.clip();

    // At scale 1, image covers the circle (cover semantics: min side = CROP_SIZE)
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
      // Timestamp in filename busts browser cache on re-upload
      const path = `profile-pictures/${user.id}-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("salon-branding")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("salon-branding").getPublicUrl(path);

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", user.id);
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { handleDiscard(); onClose(); } }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        {cropUrl ? (
          /* ── Crop view ── */
          <div className="flex flex-col items-center gap-4 py-1">
            <p className="text-xs text-muted-foreground">Drag to reposition · scroll to zoom</p>

            {/* Circular crop preview */}
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
                style={{
                  width: "auto",
                  height: "auto",
                  transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropScale})`,
                  top: "50%",
                  left: "50%",
                  minWidth: `${CROP_SIZE}px`,
                  minHeight: `${CROP_SIZE}px`,
                  objectFit: "cover",
                  transformOrigin: "center",
                }}
              />
            </div>

            {/* Zoom slider */}
            <div className="flex w-full items-center gap-2">
              <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.05}
                value={cropScale}
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
          /* ── Profile view ── */
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
              {profile?.phone && (
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </p>
                  <p className="text-sm">{profile.phone}</p>
                </div>
              )}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
