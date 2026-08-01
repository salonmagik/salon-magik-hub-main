import { useMemo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { LogOut, MapPin } from "lucide-react";
import type { StaffMember } from "@/hooks/useStaff";
import { useActiveCheckIns } from "@/hooks/useStaffCheckIns";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { toast } from "@ui/ui/use-toast";

export function CheckInsTab({ staff }: { staff: StaffMember[] }) {
  const { checkIns, isLoading, forceCheckOut } = useActiveCheckIns();
  const { locations } = useManageableLocations();

  const staffNames = useMemo(
    () => new Map(staff.map((member) => [member.userId, member.profile?.full_name || member.email || "Team member"])),
    [staff],
  );
  const locationNames = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  );

  const handleForceCheckOut = async (id: string) => {
    try {
      await forceCheckOut(id);
      toast({ title: "Checked out" });
    } catch (error) {
      toast({
        title: "Could not check out",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg font-medium">Check-ins</h2>
        <p className="text-sm text-muted-foreground">Who's currently checked in, across every location.</p>
      </div>

      <Card className="overflow-hidden rounded-[18px] border-black/[0.06] shadow-none">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base font-normal">Checked in now</CardTitle>
          {!isLoading && (
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
              {checkIns.length} on-site
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
          ) : checkIns.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nobody is checked in right now.</p>
          ) : (
            checkIns.map((checkIn) => (
              <div key={checkIn.id} className="flex items-center justify-between rounded-[14px] border border-black/[0.07] p-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {(staffNames.get(checkIn.user_id) || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{staffNames.get(checkIn.user_id) || "Team member"}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {locationNames.get(checkIn.location_id) || "Unknown location"} · since{" "}
                      {new Date(checkIn.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (
                      {formatDistanceToNowStrict(new Date(checkIn.checked_in_at))})
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-xs text-muted-foreground"
                  onClick={() => handleForceCheckOut(checkIn.id)}
                >
                  <LogOut className="mr-1.5 h-3 w-3" /> Check out
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
