import { useMemo, useState } from "react";
import { useClientAuth } from "@/hooks";
import { supabase } from "@/lib/supabase";
import { UserCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { toast } from "@ui/ui/use-toast";
import { getFunctionErrorMessage } from "@shared/function-errors";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOB_YEAR = 2000;
const daysInMonth = (month: number) => new Date(DOB_YEAR, month, 0).getDate();

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

/**
 * One-time nudge shown after a customer's first login, prompting them to
 * confirm (or correct) details a salon may have entered on their behalf
 * when adding them — name, date of birth, gender. Skippable; either action
 * marks profiles.details_confirmed_at so it never shows again.
 */
export function ConfirmDetailsModal() {
  const { profile, customers, refreshAccount } = useClientAuth();
  const primaryCustomer = customers[0];

  const initial = useMemo(() => {
    const { first, last } = splitName(profile?.full_name || primaryCustomer?.full_name || "");
    const birthday = primaryCustomer?.birthday || "";
    const [, month, day] = birthday.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
    return {
      firstName: first,
      lastName: last,
      gender: primaryCustomer?.gender || "prefer-not",
      dobMonth: month ? String(Number(month)) : "",
      dobDay: day ? String(Number(day)) : "",
    };
  }, [profile?.full_name, primaryCustomer?.full_name, primaryCustomer?.birthday, primaryCustomer?.gender]);

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [gender, setGender] = useState(initial.gender);
  const [dobMonth, setDobMonth] = useState(initial.dobMonth);
  const [dobDay, setDobDay] = useState(initial.dobDay);
  const [isSaving, setIsSaving] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const shouldShow =
    profile?.client_password_initialized === true && !profile?.details_confirmed_at;

  if (!shouldShow) return null;

  const submit = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("update-client-account", { body });
    if (error || data?.error) {
      toast({
        title: "Something went wrong",
        description: data?.error || (await getFunctionErrorMessage(error)),
        variant: "destructive",
      });
      return false;
    }
    await refreshAccount();
    return true;
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const ok = await submit({
        fullName: fullName || undefined,
        gender,
        dobMonth: dobMonth || undefined,
        dobDay: dobDay || undefined,
        detailsConfirmed: true,
      });
      if (ok) toast({ title: "Thanks — details saved" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    try {
      await submit({ detailsConfirmed: true });
    } finally {
      setIsSkipping(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleSkip()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserCircle2 className="h-5 w-5" />
          </div>
          <DialogTitle className="font-serif text-xl">Let's make sure we've got you right</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          One of your salons added these details when you first booked. Take a second to confirm they're right, or fix anything that isn't.
        </p>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cd-first">First name</Label>
              <Input id="cd-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cd-last">Last name</Label>
              <Input id="cd-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <div className="grid grid-cols-[1.3fr,1fr] gap-3">
              <Select value={dobMonth} onValueChange={(v) => { setDobMonth(v); setDobDay(""); }}>
                <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dobDay} onValueChange={setDobDay} disabled={!dobMonth}>
                <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: dobMonth ? daysInMonth(Number(dobMonth)) : 31 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prefer-not">Prefer not to say</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-3">
          <Button onClick={handleConfirm} disabled={isSaving || isSkipping} className="w-full">
            {isSaving ? "Saving..." : "Confirm & continue"}
          </Button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={isSaving || isSkipping}
            className="w-full py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            {isSkipping ? "..." : "Skip for now"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
