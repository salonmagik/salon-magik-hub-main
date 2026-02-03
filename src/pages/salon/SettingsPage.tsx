import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Building2,
  Clock,
  User,
  CreditCard,
  Bell,
  Shield,
  Zap,
  Link,
  Upload,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const settingsTabs = [
  { id: "profile", label: "Salon Profile", icon: Building2 },
  { id: "hours", label: "Business Hours", icon: Clock },
  { id: "booking", label: "Booking Settings", icon: User },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "subscription", label: "Subscription", icon: Zap },
  { id: "integrations", label: "Integrations", icon: Link },
];

const weekDays = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return tab && settingsTabs.some((t) => t.id === tab) ? tab : "profile";
  });
  const [isSaving, setIsSaving] = useState(false);
  const { currentTenant, profile } = useAuth();
  const { defaultLocation, isLoading: locationsLoading, refetch: refetchLocations } = useLocations();

  // Sync tab with URL params
  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && settingsTabs.some((t) => t.id === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  const [profileData, setProfileData] = useState({
    salonName: "",
    ownerName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    currency: "USD",
    website: "",
  });

  const [hoursData, setHoursData] = useState({
    openingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
    openingTime: "09:00",
    closingTime: "18:00",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailAppointmentReminders: true,
    smsAppointmentReminders: false,
    emailNewBookings: true,
    emailCancellations: true,
    emailDailyDigest: false,
  });

  // Load data from tenant and location
  useEffect(() => {
    if (currentTenant) {
      setProfileData((prev) => ({
        ...prev,
        salonName: currentTenant.name || "",
        country: currentTenant.country || "",
        currency: currentTenant.currency || "USD",
      }));
    }
    if (profile) {
      setProfileData((prev) => ({
        ...prev,
        ownerName: profile.full_name || "",
        phone: profile.phone || "",
      }));
    }
    if (defaultLocation) {
      setProfileData((prev) => ({
        ...prev,
        city: defaultLocation.city || "",
        address: defaultLocation.address || "",
      }));
      setHoursData({
        openingDays: defaultLocation.opening_days || [],
        openingTime: defaultLocation.opening_time?.substring(0, 5) || "09:00",
        closingTime: defaultLocation.closing_time?.substring(0, 5) || "18:00",
      });
    }
  }, [currentTenant, profile, defaultLocation]);

  const handleProfileSave = async () => {
    if (!currentTenant?.id) return;

    setIsSaving(true);
    try {
      // Update tenant
      const { error: tenantError } = await supabase
        .from("tenants")
        .update({
          name: profileData.salonName,
          currency: profileData.currency,
        })
        .eq("id", currentTenant.id);

      if (tenantError) throw tenantError;

      // Update location if exists
      if (defaultLocation?.id) {
        const { error: locationError } = await supabase
          .from("locations")
          .update({
            city: profileData.city,
            address: profileData.address,
          })
          .eq("id", defaultLocation.id);

        if (locationError) throw locationError;
      }

      toast({ title: "Saved", description: "Profile settings updated" });
    } catch (err) {
      console.error("Error saving profile:", err);
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleHoursSave = async () => {
    if (!defaultLocation?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("locations")
        .update({
          opening_days: hoursData.openingDays,
          opening_time: hoursData.openingTime,
          closing_time: hoursData.closingTime,
        })
        .eq("id", defaultLocation.id);

      if (error) throw error;

      toast({ title: "Saved", description: "Business hours updated" });
      refetchLocations();
    } catch (err) {
      console.error("Error saving hours:", err);
      toast({ title: "Error", description: "Failed to save hours", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setHoursData((prev) => ({
      ...prev,
      openingDays: prev.openingDays.includes(day)
        ? prev.openingDays.filter((d) => d !== day)
        : [...prev.openingDays, day],
    }));
  };

  const renderProfileTab = () => (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* Logo Upload */}
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed border-border">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <Button variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Upload Logo
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG up to 2MB
            </p>
          </div>
        </div>

        {/* Salon & Owner Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Salon Name</Label>
            <Input
              value={profileData.salonName}
              onChange={(e) => setProfileData((prev) => ({ ...prev, salonName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Owner Name</Label>
            <Input
              value={profileData.ownerName}
              onChange={(e) => setProfileData((prev) => ({ ...prev, ownerName: e.target.value }))}
              disabled
            />
          </div>
        </div>

        {/* Email & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" value={profileData.email} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={profileData.phone}
                onChange={(e) => setProfileData((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="space-y-2">
          <Label>Address</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Enter street address"
              value={profileData.address}
              onChange={(e) => setProfileData((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
        </div>

        {/* City & Country */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>City</Label>
            <Input
              value={profileData.city}
              onChange={(e) => setProfileData((prev) => ({ ...prev, city: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Input value={profileData.country} disabled />
          </div>
        </div>

        {/* Currency */}
        <div className="space-y-2">
          <Label>Default currency</Label>
          <Select
            value={profileData.currency}
            onValueChange={(v) => setProfileData((prev) => ({ ...prev, currency: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GHS">Ghanaian Cedi (GHS)</SelectItem>
              <SelectItem value="NGN">Nigerian Naira (NGN)</SelectItem>
              <SelectItem value="USD">US Dollar (USD)</SelectItem>
              <SelectItem value="EUR">Euro (EUR)</SelectItem>
              <SelectItem value="GBP">British Pound (GBP)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleProfileSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderHoursTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>Business Hours</CardTitle>
        <CardDescription>
          Set your salon's operating hours. These will be used for online booking availability.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {locationsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Opening Days */}
            <div className="space-y-3">
              <Label>Open Days</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {weekDays.map((day) => (
                  <button
                    key={day.key}
                    onClick={() => toggleDay(day.key)}
                    className={cn(
                      "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                      hoursData.openingDays.includes(day.key)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opening & Closing Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Opening Time</Label>
                <TimePicker
                  value={hoursData.openingTime}
                  onChange={(time) => setHoursData((prev) => ({ ...prev, openingTime: time }))}
                  step={30}
                />
              </div>
              <div className="space-y-2">
                <Label>Closing Time</Label>
                <TimePicker
                  value={hoursData.closingTime}
                  onChange={(time) => setHoursData((prev) => ({ ...prev, closingTime: time }))}
                  step={30}
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleHoursSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save hours
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  const renderNotificationsTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Configure how you and your customers receive notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Email appointment reminders</p>
              <p className="text-sm text-muted-foreground">
                Send customers email reminders before appointments
              </p>
            </div>
            <Switch
              checked={notificationSettings.emailAppointmentReminders}
              onCheckedChange={(checked) =>
                setNotificationSettings((prev) => ({ ...prev, emailAppointmentReminders: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">SMS appointment reminders</p>
              <p className="text-sm text-muted-foreground">
                Send customers SMS reminders (uses credits)
              </p>
            </div>
            <Switch
              checked={notificationSettings.smsAppointmentReminders}
              onCheckedChange={(checked) =>
                setNotificationSettings((prev) => ({ ...prev, smsAppointmentReminders: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">New booking notifications</p>
              <p className="text-sm text-muted-foreground">
                Get notified when a new booking is made
              </p>
            </div>
            <Switch
              checked={notificationSettings.emailNewBookings}
              onCheckedChange={(checked) =>
                setNotificationSettings((prev) => ({ ...prev, emailNewBookings: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Cancellation alerts</p>
              <p className="text-sm text-muted-foreground">
                Get notified when an appointment is cancelled
              </p>
            </div>
            <Switch
              checked={notificationSettings.emailCancellations}
              onCheckedChange={(checked) =>
                setNotificationSettings((prev) => ({ ...prev, emailCancellations: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Daily digest</p>
              <p className="text-sm text-muted-foreground">
                Receive a daily summary of upcoming appointments
              </p>
            </div>
            <Switch
              checked={notificationSettings.emailDailyDigest}
              onCheckedChange={(checked) =>
                setNotificationSettings((prev) => ({ ...prev, emailDailyDigest: checked }))
              }
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button disabled>
            <Save className="w-4 h-4 mr-2" />
            Save preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderPlaceholderTab = () => (
    <Card>
      <CardContent className="p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          {(() => {
            const tab = settingsTabs.find((t) => t.id === activeTab);
            if (tab) {
              const Icon = tab.icon;
              return <Icon className="w-8 h-8 text-muted-foreground" />;
            }
            return null;
          })()}
        </div>
        <h3 className="font-semibold text-lg">
          {settingsTabs.find((t) => t.id === activeTab)?.label}
        </h3>
        <p className="text-muted-foreground mt-2">
          This section is coming soon.
        </p>
      </CardContent>
    </Card>
  );

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your salon's configuration and preferences
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Settings Navigation - Mobile Dropdown */}
          <div className="lg:hidden">
            <Select value={activeTab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  {(() => {
                    const tab = settingsTabs.find((t) => t.id === activeTab);
                    if (tab) {
                      const Icon = tab.icon;
                      return (
                        <>
                          <Icon className="w-4 h-4" />
                          {tab.label}
                        </>
                      );
                    }
                    return <SelectValue />;
                  })()}
                </div>
              </SelectTrigger>
              <SelectContent>
                {settingsTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <SelectItem key={tab.id} value={tab.id}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {tab.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Settings Navigation - Desktop Sidebar */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <nav className="space-y-1">
              {settingsTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition-all",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Settings Content */}
          <div className="flex-1">
            {activeTab === "profile" && renderProfileTab()}
            {activeTab === "hours" && renderHoursTab()}
            {activeTab === "notifications" && renderNotificationsTab()}
            {!["profile", "hours", "notifications"].includes(activeTab) && renderPlaceholderTab()}
          </div>
        </div>
      </div>
    </SalonSidebar>
  );
}
