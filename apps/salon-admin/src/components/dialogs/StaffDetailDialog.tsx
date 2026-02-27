import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Separator } from "@ui/separator";
import { Mail, Phone, Calendar, Shield, Activity, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { StaffMember } from "@/hooks/useStaff";

interface StaffDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffMember | null;
}

const roleLabels: Record<StaffMember["role"], string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Staff",
};

const roleColors: Record<StaffMember["role"], string> = {
  owner: "bg-primary text-primary-foreground",
  manager: "bg-secondary text-secondary-foreground",
  supervisor: "bg-secondary text-secondary-foreground",
  receptionist: "bg-muted text-muted-foreground",
  staff: "bg-muted text-muted-foreground",
};

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function StaffDetailDialog({ open, onOpenChange, staff }: StaffDetailDialogProps) {
  if (!staff) return null;

  const isActive = (staff as any).isActive !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Team Member Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Profile Header */}
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={staff.profile?.avatar_url || undefined} />
              <AvatarFallback className="text-lg bg-primary/10 text-primary">
                {getInitials(staff.profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg truncate">
                {staff.profile?.full_name || "Unknown"}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={roleColors[staff.role]}>
                  {roleLabels[staff.role]}
                </Badge>
                <Badge variant={isActive ? "outline" : "destructive"}>
                  {isActive ? "Active" : "Deactivated"}
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Contact Information */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Contact Information</h4>
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">—</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Phone className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{staff.profile?.phone || "—"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Role & Permissions */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Role & Access</h4>
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Shield className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Role</p>
                <p className="font-medium">{roleLabels[staff.role]}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Activity className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-medium">{isActive ? "Active" : "Deactivated"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Building2 className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assigned Salons</p>
                {staff.role === "owner" ? (
                  <p className="font-medium">ALL</p>
                ) : staff.assignedLocationNames.length === 0 ? (
                  <p className="font-medium">Unassigned</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {staff.assignedLocationNames.map((locationName) => (
                      <Badge key={locationName} variant="outline">
                        {locationName}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Joined</p>
                <p className="font-medium">—</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
