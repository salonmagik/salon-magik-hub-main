import { useMemo, useState } from "react";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Separator } from "@ui/separator";
import { Avatar, AvatarFallback } from "@ui/avatar";
import { User, Shield, Bell, Mail, Phone, LogOut, KeyRound, BadgeCheck, Pencil, X, Check, Loader2 } from "lucide-react";
import { PhoneInput } from "@ui/phone-input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import { toast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { ValidationChecklist } from "@ui/validation-checklist";
import { validatePasswordStrength } from "@shared/validation";
import { getFunctionErrorMessage } from "@shared/function-errors";

export default function ClientProfilePage() {
  const { user, customers, profile, preferences, signOut, refreshAccount } = useClientAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [fullName, setFullName] = useState(profile?.full_name || customers[0]?.full_name || "");
  const [emailBookingUpdates, setEmailBookingUpdates] = useState(preferences?.email_booking_updates ?? true);
  const [smsBookingUpdates, setSmsBookingUpdates] = useState(preferences?.sms_booking_updates ?? false);
  const [marketingOptIn, setMarketingOptIn] = useState(preferences?.marketing_opt_in ?? false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Phone number is never edited directly — changing it (or re-verifying the
  // current one) always goes through request-phone-change-otp /
  // confirm-phone-change so it's proven before it's saved.
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [isVerifyingPhoneOtp, setIsVerifyingPhoneOtp] = useState(false);

  const primaryCustomer = customers[0];
  const userName = fullName || primaryCustomer?.full_name || user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || primaryCustomer?.email || "";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const passwordState = useMemo(() => validatePasswordStrength(newPassword), [newPassword]);
  const hasPassword = profile?.client_password_initialized === true || user?.user_metadata?.password_initialized === true;
  const emailVerified = Boolean(user?.email_confirmed_at);
  const phoneVerified = Boolean(profile?.phone_verified_at);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      toast({ title: "Signed out successfully" });
    } catch {
      toast({ title: "Error signing out", variant: "destructive" });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-client-account", {
        body: { fullName },
      });
      if (error || data?.error) {
        toast({ title: "Failed to update profile", description: data?.error || error?.message, variant: "destructive" });
        return;
      }
      await refreshAccount();
      toast({ title: "Profile updated" });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const savePreferences = async () => {
    setIsSavingPreferences(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-client-account", {
        body: {
          preferences: {
            email_booking_updates: emailBookingUpdates,
            sms_booking_updates: smsBookingUpdates,
            marketing_opt_in: marketingOptIn,
          },
        },
      });
      if (error || data?.error) {
        toast({ title: "Failed to update preferences", description: data?.error || error?.message, variant: "destructive" });
        return;
      }
      await refreshAccount();
      toast({ title: "Preferences updated" });
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const startEditPhone = () => {
    setPhoneInput(profile?.phone || customers[0]?.phone || "");
    setEditingPhone(true);
  };

  const cancelEditPhone = () => {
    setEditingPhone(false);
    setPhoneInput("");
    setPhoneOtpSent(false);
    setPhoneOtpCode("");
  };

  const handleRequestPhoneOtp = async () => {
    const trimmed = phoneInput.trim();
    if (!trimmed || !/^\+[1-9]\d{7,14}$/.test(trimmed)) {
      toast({ title: "Invalid phone number", description: "Enter a full international number (e.g. +2348012345678).", variant: "destructive" });
      return;
    }
    setIsSavingPhone(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-phone-change-otp", {
        body: { phone: trimmed },
      });
      if (error || data?.error) {
        toast({
          title: "Could not send code",
          description: data?.error || data?.message || (await getFunctionErrorMessage(error)),
          variant: "destructive",
        });
        return;
      }
      setPhoneOtpSent(true);
      toast({ title: "Code sent", description: `Enter the code we sent to ${trimmed}.` });
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleConfirmPhoneOtp = async () => {
    const trimmed = phoneInput.trim();
    if (phoneOtpCode.length !== 6 || !trimmed) return;
    setIsVerifyingPhoneOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("confirm-phone-change", {
        body: { phone: trimmed, otp: phoneOtpCode },
      });
      if (error || data?.error) {
        toast({
          title: "Verification failed",
          description: data?.error || data?.message || (await getFunctionErrorMessage(error)),
          variant: "destructive",
        });
        setPhoneOtpCode("");
        return;
      }
      await refreshAccount();
      cancelEditPhone();
      toast({ title: "Phone number updated" });
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };

  const changePassword = async () => {
    if (!passwordState.isValid) {
      toast({ title: "Password requirements not met", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast({ title: "Failed to change password", description: error.message, variant: "destructive" });
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      await refreshAccount();
      toast({ title: "Password updated" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Profile & Security</h1>
          <p className="mt-1 text-muted-foreground">Manage your customer account across every salon you visit.</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2">
              <Bell className="h-4 w-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card className="border-primary/15 bg-gradient-to-br from-background via-background to-primary/5">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Your shared Salon Magik account details and salon-linked profile data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="bg-primary text-2xl text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-lg font-semibold">{userName}</p>
                    <p className="text-sm text-muted-foreground">
                      Member at {customers.length} salon{customers.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input id="email" value={userEmail} disabled className="bg-muted" />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone
                    </Label>
                    <Input value={profile?.phone || customers[0]?.phone || "Not set"} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground">Manage under Security → Phone number.</p>
                  </div>
                </div>

                    <div className="flex justify-stretch sm:justify-end">
                  <Button className="w-full sm:w-auto" onClick={saveProfile} disabled={isSavingProfile}>
                    {isSavingProfile ? "Saving..." : "Save profile"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Account Security</CardTitle>
                  <CardDescription>Keep your account secure and update your password when needed.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Password</p>
                      <p className="mt-2 font-medium">{hasPassword ? "Configured" : "Required"}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Email verification</p>
                      <p className="mt-2 font-medium">{emailVerified ? "Verified" : "Pending"}</p>
                    </div>
                    <div className="rounded-xl border p-4 space-y-2 md:col-span-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone number</p>
                        {!editingPhone && (
                          <button
                            type="button"
                            onClick={startEditPhone}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title={profile?.phone ? "Change phone number" : "Add phone number"}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {editingPhone && phoneOtpSent ? (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to {phoneInput}.</p>
                          <InputOTP maxLength={6} value={phoneOtpCode} onChange={setPhoneOtpCode} disabled={isVerifyingPhoneOtp}>
                            <InputOTPGroup>
                              {Array.from({ length: 6 }).map((_, i) => (
                                <InputOTPSlot key={i} index={i} />
                              ))}
                            </InputOTPGroup>
                          </InputOTP>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={cancelEditPhone} disabled={isVerifyingPhoneOtp}>
                              <X className="w-3.5 h-3.5 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" className="flex-1" onClick={handleConfirmPhoneOtp} disabled={isVerifyingPhoneOtp || phoneOtpCode.length !== 6}>
                              {isVerifyingPhoneOtp ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                              Verify
                            </Button>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setPhoneOtpSent(false); setPhoneOtpCode(""); }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            disabled={isVerifyingPhoneOtp}
                          >
                            Use a different number
                          </button>
                        </div>
                      ) : editingPhone ? (
                        <div className="space-y-2">
                          <PhoneInput
                            value={phoneInput}
                            onChange={setPhoneInput}
                            defaultCountry={customers[0]?.tenant?.country || "GH"}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={cancelEditPhone} disabled={isSavingPhone}>
                              <X className="w-3.5 h-3.5 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" className="flex-1" onClick={handleRequestPhoneOtp} disabled={isSavingPhone}>
                              {isSavingPhone ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                              Send code
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{profile?.phone || customers[0]?.phone || "Not set"}</p>
                          <p className="text-xs text-muted-foreground">{phoneVerified ? "Verified" : "Not verified"}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium">Change password</h3>
                      <p className="text-sm text-muted-foreground">
                        Use a unique password to protect your bookings, credits, and account activity.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="new-password">New password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm password</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                        />
                      </div>
                    </div>

                    <ValidationChecklist
                      title="Password requirements"
                      description="Passwords must meet all of the requirements below."
                      rules={passwordState.rules}
                    />

                    <div className="flex justify-end">
                      <Button onClick={changePassword} disabled={isChangingPassword}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        {isChangingPassword ? "Updating..." : "Update password"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Session</CardTitle>
                  <CardDescription>Your current authenticated session.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <BadgeCheck className="h-4 w-4 text-primary" />
                      Current session
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">This browser is signed in and active now.</p>
                  </div>

                  <Button variant="destructive" className="w-full" onClick={handleLogout} disabled={isLoggingOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {isLoggingOut ? "Signing out..." : "Sign out"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>Communication Preferences</CardTitle>
                <CardDescription>Control how Salon Magik and your salons contact you about bookings and offers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <Label>Email Booking Updates</Label>
                      <p className="text-sm text-muted-foreground">Booking confirmations, changes, reminders, and refund updates.</p>
                    </div>
                    <Switch checked={emailBookingUpdates} onCheckedChange={setEmailBookingUpdates} />
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <Label>SMS Booking Updates</Label>
                      <p className="text-sm text-muted-foreground">Time-sensitive reminders and appointment change alerts by SMS.</p>
                    </div>
                    <Switch checked={smsBookingUpdates} onCheckedChange={setSmsBookingUpdates} />
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <Label>Marketing Messages</Label>
                      <p className="text-sm text-muted-foreground">Promotions, campaigns, and special offers from Salon Magik and participating salons.</p>
                    </div>
                    <Switch checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
                  </div>
                </div>

                <div className="flex justify-stretch sm:justify-end">
                  <Button onClick={savePreferences} disabled={isSavingPreferences}>
                    {isSavingPreferences ? "Saving..." : "Save preferences"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ClientSidebar>
  );
}
