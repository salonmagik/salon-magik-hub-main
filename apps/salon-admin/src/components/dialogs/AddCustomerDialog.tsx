import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Switch } from "@ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { User, Mail, MapPin, Save, Loader2, ArrowLeft, Star, CheckCircle2 } from "lucide-react";
import { PhoneInput } from "@ui/phone-input";
import { useCustomers } from "@/hooks/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { COUNTRIES } from "@shared/countries";
import { toast } from "@ui/ui/use-toast";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Fixed placeholder year (2000, a leap year) — only month/day are ever used
// or displayed; matches how the birthday-messages feature already reads this
// column (month+day only, year ignored).
const DOB_YEAR = 2000;
const DAYS_IN_MONTH = (month: number) => new Date(DOB_YEAR, month, 0).getDate();

type Step = "identity" | "existing" | "new";

interface IdentityMatch {
  full_name: string | null;
  gender: string | null;
  birthday: string | null;
  country: string | null;
  address: string | null;
  city: string | null;
}

const emptyForm = {
  firstName: "",
  lastName: "",
  gender: "prefer-not",
  dobMonth: "",
  dobDay: "",
  country: "",
  address: "",
  city: "",
  notes: "",
  isVip: false,
};

export function AddCustomerDialog({ open, onOpenChange, onSuccess }: AddCustomerDialogProps) {
  const { createCustomer } = useCustomers();
  const { currentTenant } = useAuth();
  const [step, setStep] = useState<Step>("identity");
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [match, setMatch] = useState<IdentityMatch | null>(null);
  const [form, setForm] = useState(emptyForm);

  const reset = () => {
    setStep("identity");
    setEmail("");
    setPhone("");
    setMatch(null);
    setForm(emptyForm);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleCheckIdentity = async () => {
    if (!phone.trim()) {
      toast({ title: "Phone number is required", variant: "destructive" });
      return;
    }
    if (!currentTenant?.id) return;

    setIsChecking(true);
    try {
      const { data, error } = await (supabase.rpc as any)("lookup_customer_identity", {
        p_tenant_id: currentTenant.id,
        p_email: email || null,
        p_phone: phone || null,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      if (result?.exists_in_tenant) {
        toast({
          title: "Already your customer",
          description: "A customer with this email or phone number is already in your salon.",
          variant: "destructive",
        });
        return;
      }

      if (result?.found_elsewhere) {
        setMatch({
          full_name: result.full_name,
          gender: result.gender,
          birthday: result.birthday,
          country: result.country,
          address: result.address,
          city: result.city,
        });
        setStep("existing");
      } else {
        setStep("new");
      }
    } catch (err) {
      console.error("Error checking customer identity:", err);
      toast({
        title: "Error",
        description: "Could not check this customer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const buildBirthday = () =>
    form.dobMonth && form.dobDay
      ? `${DOB_YEAR}-${form.dobMonth.padStart(2, "0")}-${form.dobDay.padStart(2, "0")}`
      : undefined;

  const handleSubmitExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!match) return;
    setIsSubmitting(true);
    try {
      const result = await createCustomer({
        fullName: match.full_name || "Salon Magik Customer",
        phone: phone || undefined,
        email: email || undefined,
        notes: form.notes || undefined,
        birthday: match.birthday || undefined,
        gender: match.gender || undefined,
        country: match.country || undefined,
        address: match.address || undefined,
        city: match.city || undefined,
        isVip: form.isVip,
      });
      if (result) {
        handleClose(false);
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const fullName = `${form.firstName} ${form.lastName}`.trim();
      const result = await createCustomer({
        fullName,
        phone: phone || undefined,
        email: email || undefined,
        notes: form.notes || undefined,
        birthday: buildBirthday(),
        gender: form.gender,
        country: form.country || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        isVip: form.isVip,
      });
      if (result) {
        handleClose(false);
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[92vh] rounded-[2rem] border-0 sm:max-w-2xl">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="font-serif text-2xl">Add Customer</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {step === "identity"
                ? "Start with their email or phone number"
                : step === "existing"
                  ? "This person is already a Salon Magik customer"
                  : "Create a new customer profile"}
            </p>
          </div>
        </DialogHeader>

        {/* Step 1: identity */}
        {step === "identity" && (
          <>
            <div className={DIALOG_BODY_PADDING}>
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Enter email address"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>
                  Phone <span className="text-destructive">*</span>
                </Label>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  defaultCountry={currentTenant?.country || "GH"}
                />
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCheckIdentity}
                disabled={isChecking}
                className="gap-2 w-full sm:w-auto"
              >
                {isChecking && <Loader2 className="w-4 h-4 animate-spin" />}
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2a: found elsewhere — minimal form */}
        {step === "existing" && match && (
          <form onSubmit={handleSubmitExisting}>
          <div className={DIALOG_BODY_PADDING}>
            <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{match.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  Already a Salon Magik customer — their profile details are on file.
                  You can add your own notes and mark them as VIP for your salon.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                <Label className="cursor-pointer">Mark as VIP</Label>
              </div>
              <Switch
                checked={form.isVip}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, isVip: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any additional information about this customer..."
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("identity")}
                disabled={isSubmitting}
                className="gap-2 w-full sm:w-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button type="submit" className="gap-2 w-full sm:w-auto" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Add Customer
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Step 2b: not found — full form */}
        {step === "new" && (
          <form onSubmit={handleSubmitNew}>
          <div className={DIALOG_BODY_PADDING}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Enter first name"
                  value={form.firstName}
                  onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Enter last name"
                  value={form.lastName}
                  onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, gender: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prefer-not">Prefer not to say</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.dobMonth}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        dobMonth: v,
                        // clamp day if the new month has fewer days
                        dobDay:
                          prev.dobDay && Number(prev.dobDay) > DAYS_IN_MONTH(Number(v))
                            ? String(DAYS_IN_MONTH(Number(v)))
                            : prev.dobDay,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.dobDay}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, dobDay: v }))}
                    disabled={!form.dobMonth}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        { length: form.dobMonth ? DAYS_IN_MONTH(Number(form.dobMonth)) : 31 },
                        (_, i) => i + 1,
                      ).map((d) => (
                        <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Country</Label>
              <Select
                value={form.country}
                onValueChange={(v) => setForm((prev) => ({ ...prev, country: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Street address"
                    className="pl-9"
                    value={form.address}
                    onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  placeholder="Enter city"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                <Label className="cursor-pointer">Mark as VIP</Label>
              </div>
              <Switch
                checked={form.isVip}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, isVip: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any additional information about this customer..."
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("identity")}
                disabled={isSubmitting}
                className="gap-2 w-full sm:w-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button type="submit" className="gap-2 w-full sm:w-auto" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Add Customer
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
