import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { CalendarOff, HeartPulse, Leaf, Settings2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { StaffMember } from "@/hooks/useStaff";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import { toast } from "@ui/ui/use-toast";

type LeaveType = "annual" | "sick" | "compassionate";
type Policy = { leave_type: LeaveType; allowance_days: number };
type TimeOff = {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  starts_on: string;
  ends_on: string;
  days_used: number;
  note: string | null;
  status: "approved" | "cancelled";
};

const leaveMeta: Record<LeaveType, { label: string; icon: typeof Leaf; tone: string }> = {
  annual: { label: "Annual leave", icon: Leaf, tone: "bg-emerald-50 text-emerald-700" },
  sick: { label: "Sick leave", icon: HeartPulse, tone: "bg-rose-50 text-rose-700" },
  compassionate: { label: "Compassionate leave", icon: CalendarOff, tone: "bg-violet-50 text-violet-700" },
};

export function TimeOffTab({
  tenantId,
  actorId,
  staff,
  canManage,
}: {
  tenantId: string;
  actorId: string;
  staff: StaffMember[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [recordOpen, setRecordOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [policyDraft, setPolicyDraft] = useState<Record<LeaveType, number>>({
    annual: 20,
    sick: 10,
    compassionate: 5,
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["staff-time-off-policies", tenantId],
    queryFn: async (): Promise<Policy[]> => {
      const { data, error } = await (supabase as any)
        .from("staff_time_off_policies")
        .select("leave_type, allowance_days")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: timeOff = [] } = useQuery({
    queryKey: ["staff-time-off", tenantId],
    queryFn: async (): Promise<TimeOff[]> => {
      const year = new Date().getFullYear();
      const { data, error } = await (supabase as any)
        .from("staff_time_off")
        .select("id, user_id, leave_type, starts_on, ends_on, days_used, note, status")
        .eq("tenant_id", tenantId)
        .gte("ends_on", `${year}-01-01`)
        .lte("starts_on", `${year}-12-31`)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const allowance = (type: LeaveType) =>
    policies.find((policy) => policy.leave_type === type)?.allowance_days ?? policyDraft[type];
  const daysRequested =
    startsOn && endsOn ? Math.max(differenceInCalendarDays(new Date(endsOn), new Date(startsOn)) + 1, 0) : 0;
  const selectedUsed = timeOff
    .filter((item) => item.user_id === staffId && item.leave_type === leaveType && item.status === "approved")
    .reduce((sum, item) => sum + item.days_used, 0);
  const exceedsAllowance = daysRequested > Math.max(allowance(leaveType) - selectedUsed, 0);
  const staffNames = useMemo(
    () => new Map(staff.map((member) => [member.userId, member.profile?.full_name || member.email || "Team member"])),
    [staff],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("staff_time_off").insert({
        tenant_id: tenantId,
        user_id: staffId,
        leave_type: leaveType,
        starts_on: startsOn,
        ends_on: endsOn,
        note: note.trim() || null,
        created_by: actorId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff-time-off", tenantId] });
      setRecordOpen(false);
      setStartsOn("");
      setEndsOn("");
      setNote("");
      toast({ title: "Time off recorded", description: "The team member’s availability has been updated." });
    },
    onError: (error: Error) =>
      toast({ title: "Could not record time off", description: error.message, variant: "destructive" }),
  });

  const policyMutation = useMutation({
    mutationFn: async () => {
      const rows = (Object.keys(policyDraft) as LeaveType[]).map((type) => ({
        tenant_id: tenantId,
        leave_type: type,
        allowance_days: Math.max(0, policyDraft[type]),
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await (supabase as any)
        .from("staff_time_off_policies")
        .upsert(rows, { onConflict: "tenant_id,leave_type" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff-time-off-policies", tenantId] });
      setPolicyOpen(false);
      toast({ title: "Time-off limits updated" });
    },
    onError: (error: Error) =>
      toast({ title: "Could not update limits", description: error.message, variant: "destructive" }),
  });

  const openPolicies = () => {
    setPolicyDraft({
      annual: allowance("annual"),
      sick: allowance("sick"),
      compassionate: allowance("compassionate"),
    });
    setPolicyOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-lg font-medium">Time off</h2>
          <p className="text-sm text-muted-foreground">Set leave and see allowance usage for every team member.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={openPolicies}>
              <Settings2 className="mr-2 h-4 w-4" /> Limits
            </Button>
            <Button className="rounded-full" onClick={() => setRecordOpen(true)}>
              <CalendarOff className="mr-2 h-4 w-4" /> Set time off
            </Button>
          </div>
        )}
      </div>

      <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
        {(Object.keys(leaveMeta) as LeaveType[]).map((type) => {
          const meta = leaveMeta[type];
          const Icon = meta.icon;
          return (
            <Card key={type} className="min-w-[210px] flex-1 rounded-[14px] border-black/[0.06] shadow-none">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-xl p-2.5 ${meta.tone}`}><Icon className="h-4 w-4" /></div>
                <div><p className="text-xs text-muted-foreground">{meta.label}</p><p className="font-serif text-xl">{allowance(type)} days</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden rounded-[18px] border-black/[0.06] shadow-none">
        <CardHeader><CardTitle className="text-base font-normal">Team allowance usage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {staff.map((member) => (
            <div key={member.userId} className="rounded-[14px] border border-black/[0.07] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><p className="font-medium">{staffNames.get(member.userId)}</p><p className="text-xs text-muted-foreground">{member.email}</p></div>
                {timeOff.some((item) => item.user_id === member.userId && item.status === "approved" && item.starts_on <= format(new Date(), "yyyy-MM-dd") && item.ends_on >= format(new Date(), "yyyy-MM-dd")) && (
                  <Badge variant="warning">Off today</Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(leaveMeta) as LeaveType[]).map((type) => {
                  const used = timeOff.filter((item) => item.user_id === member.userId && item.leave_type === type && item.status === "approved").reduce((sum, item) => sum + item.days_used, 0);
                  return <div key={type} className="rounded-lg bg-[#f7f4ef] p-2.5"><p className="truncate text-[11px] text-muted-foreground">{leaveMeta[type].label}</p><p className="mt-1 text-sm font-medium">{used} / {allowance(type)}</p></div>;
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="rounded-[22px] sm:max-w-[540px]">
          <DialogHeader><DialogTitle className="font-serif text-xl">Set time off</DialogTitle><DialogDescription>Record approved leave and reserve it from the team member’s allowance.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Team member</Label><Select value={staffId} onValueChange={setStaffId}><SelectTrigger className="mt-1.5 h-12"><SelectValue placeholder="Select team member" /></SelectTrigger><SelectContent>{staff.map((member) => <SelectItem key={member.userId} value={member.userId}>{staffNames.get(member.userId)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Leave type</Label><Select value={leaveType} onValueChange={(value) => setLeaveType(value as LeaveType)}><SelectTrigger className="mt-1.5 h-12"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(leaveMeta) as LeaveType[]).map((type) => <SelectItem key={type} value={type}>{leaveMeta[type].label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="leave-start">Starts</Label><Input id="leave-start" type="date" className="mt-1.5 h-12" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></div><div><Label htmlFor="leave-end">Ends</Label><Input id="leave-end" type="date" min={startsOn} className="mt-1.5 h-12" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></div></div>
            <div className={`rounded-xl p-3 text-sm ${exceedsAllowance ? "bg-red-50 text-red-700" : "bg-[#f1ece3] text-muted-foreground"}`}>{daysRequested || 0} day(s) requested · {Math.max(allowance(leaveType) - selectedUsed, 0)} remaining</div>
            <div><Label htmlFor="leave-note">Note (optional)</Label><Textarea id="leave-note" className="mt-1.5" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for the team record" /></div>
          </div>
          <DialogFooter><Button variant="outline" className="rounded-full" onClick={() => setRecordOpen(false)}>Cancel</Button><Button className="rounded-full" disabled={!staffId || !startsOn || !endsOn || daysRequested < 1 || exceedsAllowance || createMutation.isPending} onClick={() => createMutation.mutate()}>Confirm time off</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="rounded-[22px] sm:max-w-[500px]">
          <DialogHeader><DialogTitle className="font-serif text-xl">Default time-off limits</DialogTitle><DialogDescription>Set the number of days available to each staff member per calendar year.</DialogDescription></DialogHeader>
          <div className="space-y-3">{(Object.keys(leaveMeta) as LeaveType[]).map((type) => <div key={type} className="flex items-center justify-between gap-4"><Label htmlFor={`policy-${type}`}>{leaveMeta[type].label}</Label><Input id={`policy-${type}`} type="number" min={0} className="h-11 w-28" value={policyDraft[type]} onChange={(event) => setPolicyDraft((current) => ({ ...current, [type]: Number(event.target.value) }))} /></div>)}</div>
          <DialogFooter><Button variant="outline" className="rounded-full" onClick={() => setPolicyOpen(false)}>Cancel</Button><Button className="rounded-full" disabled={policyMutation.isPending} onClick={() => policyMutation.mutate()}>Save limits</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
