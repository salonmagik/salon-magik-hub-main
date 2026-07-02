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
import { User, Shield, Bell, Mail, Phone, LogOut, KeyRound, BadgeCheck } from "lucide-react";
import { toast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { ValidationChecklist } from "@ui/validation-checklist";
import { validatePasswordStrength } from "@shared/validation";

export default function ClientProfilePage() {
  const { user, customers, profile, preferences, signOut, refreshAccount } = useClientAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [fullName, setFullName] = useState(profile?.full_name || customers[0]?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || customers[0]?.phone || "");
  const [emailBookingUpdates, setEmailBookingUpdates] = useState(preferences?.email_booking_updates ?? true);
  const [smsBookingUpdates, setSmsBookingUpdates] = useState(preferences?.sms_booking_updates ?? false);
  const [marketingOptIn, setMarketingOptIn] = useState(preferences?.marketing_opt_in ?? false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPhoneVerifying, setIsPhoneVerifying] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [isSubmittingOtp, setIsSubmittingOtp] = useState(false);

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
  const phoneVerified = Boolean(user?.phone_confirmed_at);

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
        body: { fullName, phone },
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

  const handleSendPhoneOtp = async () => {
    const phoneNumber = profile?.phone || customers[0]?.phone || "";
    if (!phoneNumber) {
      toast({ title: "No phone number saved", description: "Add a phone number in your profile first.", variant: "destructive" });
      return;
    }
    setIsPhoneVerifying(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: phoneNumber });
      if (error) {
        toast({ title: "Could not send code", description: error.message, variant: "destructive" });
        return;
      }
      setPhoneOtpSent(true);
      toast({ title: "Verification code sent", description: `Check your SMS messages at ${phoneNumber}.` });
    } finally {
      setIsPhoneVerifying(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    const phoneNumber = profile?.phone || customers[0]?.phone || "";
    if (!phoneOtpCode || !phoneNumber) return;
    setIsSubmittingOtp(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: phoneNumber, token: phoneOtpCode, type: "sms" });
      if (error) {
        toast({ title: "Verification failed", description: error.message, variant: "destructive" });
        return;
      }
      setPhoneOtpSent(false);
      setPhoneOtpCode("");
      await refreshAccount();
      toast({ title: "Phone verified" });
    } finally {
      setIsSubmittingOtp(false);
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
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone
                    </Label>
                    <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveProfile} disabled={isSavingProfile}>
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
                    <div className="rounded-xl border p-4 space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone verification</p>
                      <p className="font-medium">{phoneVerified ? "Verified" : "Not verified"}</p>
                      {!phoneVerified && !phoneOtpSent && (
                        <Button size="sm" variant="outline" onClick={handleSendPhoneOtp} disabled={isPhoneVerifying}>
                          {isPhoneVerifying ? "Sending..." : "Verify phone"}
                        </Button>
                      )}
                      {!phoneVerified && phoneOtpSent && (
                        <div className="flex gap-2 items-center pt-1">
                          <Input
                            className="h-8 w-24 text-sm"
                            placeholder="000000"
                            value={phoneOtpCode}
                            maxLength={6}
                            onChange={(e) => setPhoneOtpCode(e.target.value)}
                          />
                          <Button size="sm" onClick={handleVerifyPhoneOtp} disabled={isSubmittingOtp || phoneOtpCode.length < 4}>
                            {isSubmittingOtp ? "Verifying..." : "Confirm"}
                          </Button>
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
                  <div className="flex items-center justify-between rounded-xl border p-4">
                    <div className="space-y-1">
                      <Label>Email Booking Updates</Label>
                      <p className="text-sm text-muted-foreground">Booking confirmations, changes, reminders, and refund updates.</p>
                    </div>
                    <Switch checked={emailBookingUpdates} onCheckedChange={setEmailBookingUpdates} />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border p-4">
                    <div className="space-y-1">
                      <Label>SMS Booking Updates</Label>
                      <p className="text-sm text-muted-foreground">Time-sensitive reminders and appointment change alerts by SMS.</p>
                    </div>
                    <Switch checked={smsBookingUpdates} onCheckedChange={setSmsBookingUpdates} />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border p-4">
                    <div className="space-y-1">
                      <Label>Marketing Messages</Label>
                      <p className="text-sm text-muted-foreground">Promotions, campaigns, and special offers from Salon Magik and participating salons.</p>
                    </div>
                    <Switch checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
                  </div>
                </div>

                <div className="flex justify-end">
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
