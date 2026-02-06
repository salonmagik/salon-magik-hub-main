import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  Upload,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Save,
  Copy,
  Check,
  CheckCircle,
  X,
  Image as ImageIcon,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { differenceInDays, format } from "date-fns";

const settingsTabs = [
  { id: "profile", label: "Salon Profile", icon: Building2 },
  { id: "hours", label: "Business Hours", icon: Clock },
  { id: "booking", label: "Booking Settings", icon: User },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "subscription", label: "Subscription", icon: Zap },
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
  const { 
    settings: dbNotificationSettings, 
    isLoading: notificationsLoading, 
    isSaving: notificationsSaving, 
    saveSettings: saveNotificationSettings 
  } = useNotificationSettings();

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

  const [bookingSettings, setBookingSettings] = useState({
    onlineBookingEnabled: false,
    autoConfirmBookings: false,
    defaultBufferMinutes: 0,
    cancellationGraceHours: 24,
    defaultDepositPercentage: 0,
    bookingStatusMessage: "",
    slotCapacityDefault: 1,
    brandColor: "#2563EB",
  });

  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrls, setBannerUrls] = useState<string[]>([]);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  // Load data from tenant and location
  useEffect(() => {
    if (currentTenant) {
      setProfileData((prev) => ({
        ...prev,
        salonName: currentTenant.name || "",
        country: currentTenant.country || "",
        currency: currentTenant.currency || "USD",
      }));
      setBookingSettings({
        onlineBookingEnabled: currentTenant.online_booking_enabled || false,
        autoConfirmBookings: currentTenant.auto_confirm_bookings || false,
        defaultBufferMinutes: currentTenant.default_buffer_minutes || 0,
        cancellationGraceHours: currentTenant.cancellation_grace_hours || 24,
        defaultDepositPercentage: Number(currentTenant.default_deposit_percentage) || 0,
        bookingStatusMessage: currentTenant.booking_status_message || "",
        slotCapacityDefault: currentTenant.slot_capacity_default || 1,
        brandColor: (currentTenant as any).brand_color || "#2563EB",
      });
      setLogoUrl(currentTenant.logo_url || null);
      setBannerUrls(currentTenant.banner_urls || []);
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

  // Sync notification settings from database
  useEffect(() => {
    if (dbNotificationSettings) {
      setNotificationSettings({
        emailAppointmentReminders: dbNotificationSettings.email_appointment_reminders,
        smsAppointmentReminders: dbNotificationSettings.sms_appointment_reminders,
        emailNewBookings: dbNotificationSettings.email_new_bookings,
        emailCancellations: dbNotificationSettings.email_cancellations,
        emailDailyDigest: dbNotificationSettings.email_daily_digest,
      });
    }
  }, [dbNotificationSettings]);

  const handleNotificationsSave = async () => {
    await saveNotificationSettings({
      email_appointment_reminders: notificationSettings.emailAppointmentReminders,
      sms_appointment_reminders: notificationSettings.smsAppointmentReminders,
      email_new_bookings: notificationSettings.emailNewBookings,
      email_cancellations: notificationSettings.emailCancellations,
      email_daily_digest: notificationSettings.emailDailyDigest,
    });
  };

  const bookingUrl = currentTenant?.slug ? `${window.location.origin}/b/${currentTenant.slug}` : null;

  const handleCopyUrl = () => {
    if (bookingUrl) {
      navigator.clipboard.writeText(bookingUrl);
      setCopiedUrl(true);
      toast({ title: "Copied!", description: "Booking URL copied to clipboard" });
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const { refreshTenants } = useAuth();

  const handleLogoUpload = async (file: File) => {
    if (!currentTenant?.id) return;
    
    // Validate file type and size
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Error", description: "Please upload a JPG, PNG, or WebP image", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Error", description: "File size must be under 2MB", variant: "destructive" });
      return;
    }

    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${currentTenant.id}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("salon-branding")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("salon-branding")
        .getPublicUrl(filePath);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("tenants")
        .update({ logo_url: publicUrl })
        .eq("id", currentTenant.id);

      if (updateError) throw updateError;

      setLogoUrl(publicUrl);
      await refreshTenants();
      toast({ title: "Success", description: "Logo uploaded successfully" });
    } catch (err) {
      console.error("Error uploading logo:", err);
      toast({ title: "Error", description: "Failed to upload logo", variant: "destructive" });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!currentTenant?.id) return;
    if (bannerUrls.length >= 2) {
      toast({ title: "Error", description: "Maximum 2 banners allowed", variant: "destructive" });
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Error", description: "Please upload a JPG, PNG, or WebP image", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "File size must be under 5MB", variant: "destructive" });
      return;
    }

    setIsUploadingBanner(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${currentTenant.id}/banner-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("salon-branding")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("salon-branding")
        .getPublicUrl(filePath);

      const newBannerUrls = [...bannerUrls, urlData.publicUrl];

      const { error: updateError } = await supabase
        .from("tenants")
        .update({ banner_urls: newBannerUrls })
        .eq("id", currentTenant.id);

      if (updateError) throw updateError;

      setBannerUrls(newBannerUrls);
      await refreshTenants();
      toast({ title: "Success", description: "Banner uploaded successfully" });
    } catch (err) {
      console.error("Error uploading banner:", err);
      toast({ title: "Error", description: "Failed to upload banner", variant: "destructive" });
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleRemoveBanner = async (index: number) => {
    if (!currentTenant?.id) return;

    try {
      const newBannerUrls = bannerUrls.filter((_, i) => i !== index);

      const { error } = await supabase
        .from("tenants")
        .update({ banner_urls: newBannerUrls })
        .eq("id", currentTenant.id);

      if (error) throw error;

      setBannerUrls(newBannerUrls);
      await refreshTenants();
      toast({ title: "Success", description: "Banner removed" });
    } catch (err) {
      console.error("Error removing banner:", err);
      toast({ title: "Error", description: "Failed to remove banner", variant: "destructive" });
    }
  };

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

      // Refresh tenant data in context for immediate UI update
      await refreshTenants();
      
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

  const handleBookingSave = async () => {
    if (!currentTenant?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          online_booking_enabled: bookingSettings.onlineBookingEnabled,
          auto_confirm_bookings: bookingSettings.autoConfirmBookings,
          default_buffer_minutes: bookingSettings.defaultBufferMinutes,
          cancellation_grace_hours: bookingSettings.cancellationGraceHours,
          default_deposit_percentage: bookingSettings.defaultDepositPercentage,
          booking_status_message: bookingSettings.bookingStatusMessage || null,
          slot_capacity_default: bookingSettings.slotCapacityDefault,
          brand_color: bookingSettings.brandColor,
        })
        .eq("id", currentTenant.id);

      if (error) throw error;

      // Refresh tenant data in context for immediate UI update
      await refreshTenants();
      
      toast({ title: "Saved", description: "Booking settings updated" });
    } catch (err) {
      console.error("Error saving booking settings:", err);
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Generate a unique booking slug from salon name
  const handleGenerateSlug = async () => {
    if (!currentTenant?.id || !currentTenant.name) return;

    setIsGeneratingSlug(true);
    try {
      // Convert name to URL-friendly slug
      let baseSlug = currentTenant.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 40);

      // Check if slug exists
      let slug = baseSlug;
      let attempts = 0;
      while (attempts < 10) {
        const { data, error } = await supabase
          .from("tenants")
          .select("id")
          .eq("slug", slug)
          .neq("id", currentTenant.id)
          .maybeSingle();

        if (error) throw error;

        if (!data) break; // Slug is available

        // Add random suffix
        slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
        attempts++;
      }

      // Update tenant with new slug
      const { error: updateError } = await supabase
        .from("tenants")
        .update({ slug })
        .eq("id", currentTenant.id);

      if (updateError) throw updateError;

      await refreshTenants();
      toast({ title: "Success", description: "Booking URL generated!" });
    } catch (err) {
      console.error("Error generating slug:", err);
      toast({ title: "Error", description: "Failed to generate booking URL", variant: "destructive" });
    } finally {
      setIsGeneratingSlug(false);
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
          <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Salon logo" className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
              }}
            />
            <Button 
              variant="outline" 
              onClick={() => logoInputRef.current?.click()}
              disabled={isUploadingLogo}
            >
              {isUploadingLogo ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {logoUrl ? "Change Logo" : "Upload Logo"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG or WebP up to 2MB
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
          <Button onClick={handleNotificationsSave} disabled={notificationsSaving}>
            {notificationsSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderBookingTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>Booking Settings</CardTitle>
        <CardDescription>
          Configure how customers can book appointments with your salon.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Booking URL */}
        {bookingUrl ? (
          <div className="space-y-2">
            <Label>Booking URL</Label>
            <div className="flex items-center gap-2">
              <Input value={bookingUrl} readOnly className="flex-1 bg-muted" />
              <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link with your customers to let them book online
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Booking URL</Label>
            <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
              <p className="text-sm text-muted-foreground mb-3">
                Generate a booking URL to enable online bookings for your salon
              </p>
              <Button
                onClick={handleGenerateSlug}
                disabled={isGeneratingSlug}
                className="gap-2"
              >
                {isGeneratingSlug ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                Generate Booking URL
              </Button>
            </div>
          </div>
        )}

        {/* Toggle Settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Enable Online Booking</p>
              <p className="text-sm text-muted-foreground">
                Allow customers to book appointments through your booking page
              </p>
            </div>
            <Switch
              checked={bookingSettings.onlineBookingEnabled}
              disabled={isSaving}
              onCheckedChange={async (checked) => {
                if (!currentTenant?.id) return;
                setBookingSettings((prev) => ({ ...prev, onlineBookingEnabled: checked }));
                setIsSaving(true);
                try {
                  const { error } = await supabase
                    .from("tenants")
                    .update({ online_booking_enabled: checked })
                    .eq("id", currentTenant.id);
                  if (error) throw error;
                  await refreshTenants();
                  toast({ 
                    title: checked ? "Online booking enabled" : "Online booking disabled",
                    description: checked ? "Customers can now book online" : "Online booking is now off"
                  });
                } catch (err) {
                  console.error("Error updating online booking:", err);
                  setBookingSettings((prev) => ({ ...prev, onlineBookingEnabled: !checked }));
                  toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
                } finally {
                  setIsSaving(false);
                }
              }}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Auto-Confirm Bookings</p>
              <p className="text-sm text-muted-foreground">
                Automatically confirm new bookings without manual approval
              </p>
            </div>
            <Switch
              checked={bookingSettings.autoConfirmBookings}
              onCheckedChange={(checked) =>
                setBookingSettings((prev) => ({ ...prev, autoConfirmBookings: checked }))
              }
            />
          </div>
        </div>

        {/* Numeric Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Default Buffer Time</Label>
            <Select
              value={bookingSettings.defaultBufferMinutes.toString()}
              onValueChange={(v) =>
                setBookingSettings((prev) => ({ ...prev, defaultBufferMinutes: parseInt(v) }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No buffer</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cancellation Grace Period</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={bookingSettings.cancellationGraceHours}
                onChange={(e) =>
                  setBookingSettings((prev) => ({
                    ...prev,
                    cancellationGraceHours: parseInt(e.target.value) || 0,
                  }))
                }
              />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Default Deposit Percentage</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={bookingSettings.defaultDepositPercentage}
              onChange={(e) =>
                setBookingSettings((prev) => ({
                  ...prev,
                  defaultDepositPercentage: parseInt(e.target.value) || 0,
                }))
              }
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        {/* Slot Capacity */}
        <div className="space-y-2">
          <Label>Bookings per Time Slot</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={bookingSettings.slotCapacityDefault}
              onChange={(e) =>
                setBookingSettings((prev) => ({
                  ...prev,
                  slotCapacityDefault: parseInt(e.target.value) || 1,
                }))
              }
              className="w-24"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Maximum number of bookings allowed for the same time slot
          </p>
        </div>

        <div className="space-y-2">
          <Label>Booking Status Message</Label>
          <Textarea
            placeholder="Optional message to display on your booking page..."
            value={bookingSettings.bookingStatusMessage}
            onChange={(e) =>
              setBookingSettings((prev) => ({ ...prev, bookingStatusMessage: e.target.value }))
            }
            rows={2}
          />
        </div>

        {/* Booking Page Banners */}
        <div className="space-y-3">
          <div>
            <Label>Booking Page Banners</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Add up to 2 images to personalize your booking page
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {bannerUrls.map((url, index) => (
              <div key={index} className="relative group">
                <div className="w-32 h-20 rounded-lg overflow-hidden border bg-muted">
                  <img src={url} alt={`Banner ${index + 1}`} className="w-full h-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBanner(index)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {bannerUrls.length < 2 && (
              <div>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBannerUpload(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploadingBanner}
                  className="w-32 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {isUploadingBanner ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5" />
                      <span className="text-xs">Add banner</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Brand Highlight Color */}
        <div className="space-y-2">
          <Label>Brand Highlight Color</Label>
          <div className="flex items-center gap-3">
            <Input
              type="color"
              value={bookingSettings.brandColor}
              onChange={(e) =>
                setBookingSettings((prev) => ({
                  ...prev,
                  brandColor: e.target.value,
                }))
              }
              className="h-10 w-16 p-1 cursor-pointer"
            />
            <Input
              type="text"
              value={bookingSettings.brandColor}
              onChange={(e) =>
                setBookingSettings((prev) => ({
                  ...prev,
                  brandColor: e.target.value,
                }))
              }
              placeholder="#2563EB"
              className="w-28 font-mono text-sm"
            />
            <div
              className="h-10 w-10 rounded-md border"
              style={{ backgroundColor: bookingSettings.brandColor }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Used for buttons and accents on your booking page
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleBookingSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderPaymentsTab = () => {
    const isPaystack = currentTenant?.country === "NG" || currentTenant?.country === "GH";
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Payment processing is securely managed by Salon Magik.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="font-medium">Payments are processed securely</p>
                <p className="text-sm text-muted-foreground">
                  All online payments are processed through {isPaystack ? "Paystack" : "Stripe"} via Salon Magik.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Supported Payment Methods</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Card</Badge>
                {isPaystack && <Badge variant="secondary">Mobile Money</Badge>}
                <Badge variant="secondary">Cash (at salon)</Badge>
                <Badge variant="secondary">POS</Badge>
                <Badge variant="secondary">Transfer</Badge>
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Pay at Salon</p>
                <p className="text-sm text-muted-foreground">
                  Allow customers to choose to pay when they arrive
                </p>
              </div>
              <Switch
                checked={currentTenant?.pay_at_salon_enabled || false}
                disabled={isSaving}
                onCheckedChange={async (checked) => {
                  if (!currentTenant?.id) return;
                  setIsSaving(true);
                  try {
                    const { error } = await supabase
                      .from("tenants")
                      .update({ pay_at_salon_enabled: checked })
                      .eq("id", currentTenant.id);
                    if (error) {
                      console.error("Error updating pay at salon:", error);
                      toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
                      return;
                    }
                    await refreshTenants();
                    toast({ title: "Saved", description: `Pay at Salon ${checked ? "enabled" : "disabled"}` });
                  } catch (err) {
                    console.error("Error updating pay at salon:", err);
                    toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
                  } finally {
                    setIsSaving(false);
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Deposits</p>
                <p className="text-sm text-muted-foreground">
                  Require deposits for bookings
                </p>
              </div>
              <Switch
                checked={currentTenant?.deposits_enabled || false}
                disabled={isSaving}
                onCheckedChange={async (checked) => {
                  if (!currentTenant?.id) return;
                  setIsSaving(true);
                  try {
                    const { error } = await supabase
                      .from("tenants")
                      .update({ deposits_enabled: checked })
                      .eq("id", currentTenant.id);
                    if (error) {
                      console.error("Error updating deposits:", error);
                      toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
                      return;
                    }
                    await refreshTenants();
                    toast({ title: "Saved", description: `Deposits ${checked ? "enabled" : "disabled"}` });
                  } catch (err) {
                    console.error("Error updating deposits:", err);
                    toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
                  } finally {
                    setIsSaving(false);
                  }
                }}
              />
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button variant="outline" className="gap-2" asChild>
              <a href="/salon/payments">
                <CreditCard className="w-4 h-4" />
                View Transactions
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderRolesTab = () => {
    const roles = [
      { name: "Owner", permissions: ["Full access", "Manage staff", "Manage settings", "View reports", "Process refunds"] },
      { name: "Manager", permissions: ["Manage staff", "View reports", "Process refunds", "Manage appointments"] },
      { name: "Supervisor", permissions: ["Manage appointments", "View reports", "Manage customers"] },
      { name: "Receptionist", permissions: ["Manage appointments", "Manage customers", "Process payments"] },
      { name: "Staff", permissions: ["View own appointments", "Update appointment status"] },
    ];

    return (
      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
          <CardDescription>
            View the default permissions for each role. Custom roles are not yet supported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {roles.map((role) => (
              <div key={role.name} className="p-4 rounded-lg bg-muted/50 border">
                <p className="font-medium mb-2">{role.name}</p>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.map((perm) => (
                    <Badge key={perm} variant="secondary" className="text-xs">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSubscriptionTab = () => {
    const trialEndsAt = currentTenant?.trial_ends_at ? new Date(currentTenant.trial_ends_at) : null;
    const daysRemaining = trialEndsAt ? Math.max(0, differenceInDays(trialEndsAt, new Date())) : 0;
    const isTrialing = currentTenant?.subscription_status === "trialing";

    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>
            Manage your subscription and billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Plan */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold capitalize">{currentTenant?.plan || "Solo"} Plan</p>
              <Badge className={cn(
                currentTenant?.subscription_status === "active" ? "bg-success text-success-foreground" :
                currentTenant?.subscription_status === "trialing" ? "bg-primary text-primary-foreground" :
                "bg-destructive text-destructive-foreground"
              )}>
                {currentTenant?.subscription_status?.replace("_", " ") || "Unknown"}
              </Badge>
            </div>
            {isTrialing && trialEndsAt && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Trial period</span>
                  <span className="font-medium">{daysRemaining} days remaining</span>
                </div>
                <Progress value={Math.max(0, 100 - (daysRemaining / 14) * 100)} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  Ends {format(trialEndsAt, "MMM d, yyyy")}
                </p>
              </div>
            )}
          </div>

          {/* Plan Features */}
          <div>
            <p className="text-sm font-medium mb-2">Plan Features</p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                Unlimited appointments
              </li>
              <li className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                Online booking
              </li>
              <li className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                Email & SMS notifications
              </li>
              <li className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                Customer management
              </li>
            </ul>
          </div>

          {/* Upgrade Button */}
          {isTrialing && (
            <div className="pt-4 border-t">
              <Button className="w-full gap-2">
                <Zap className="w-4 h-4" />
                Upgrade Now
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Continue using all features after your trial ends
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

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
            {activeTab === "booking" && renderBookingTab()}
            {activeTab === "payments" && renderPaymentsTab()}
            {activeTab === "notifications" && renderNotificationsTab()}
            {activeTab === "roles" && renderRolesTab()}
            {activeTab === "subscription" && renderSubscriptionTab()}
          </div>
        </div>
      </div>
    </SalonSidebar>
  );
}
