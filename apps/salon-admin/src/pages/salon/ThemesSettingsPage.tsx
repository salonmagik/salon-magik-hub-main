import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Palette,
  Sparkles,
  Eye,
  ExternalLink,
  Check,
  Loader2,
  Image as ImageIcon,
  X,
  Save,
  CheckCircle2,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@shared/utils";
import { formatCurrency } from "@shared/currency";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useTenantEntitlements } from "@/hooks/useTenantEntitlements";
import { useToast } from "@ui/ui/use-toast";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { BookingThemePreview } from "@/components/settings/BookingThemePreview";

type ThemeKey = "default" | "ecommerce";

const BOOKING_URL_BASE =
  import.meta.env.VITE_PUBLIC_BOOKING_URL ||
  import.meta.env.VITE_PUBLIC_BOOKING_BASE_URL ||
  "";

export default function ThemesSettingsPage() {
  const { currentTenant, refreshTenants } = useAuth();
  const { locations } = useLocations();
  const { data: entitlements, refetch: refetchEntitlements } = useTenantEntitlements(currentTenant?.id);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("storefront");

  const [settings, setSettings] = useState({
    bookingPageBio: currentTenant?.booking_page_bio || "",
    brandColor: currentTenant?.brand_color || "#2563EB",
    storefrontMode: (currentTenant?.storefront_mode as "services" | "products" | "both") || "both",
    heroHeading: (currentTenant as any)?.hero_heading || "",
    heroTagline: (currentTenant as any)?.hero_tagline || "",
    heroBgColor: (currentTenant as any)?.hero_bg_color || "",
    heroCTAPrimary: (currentTenant as any)?.hero_cta_primary || "Book Now",
    heroCTASecondary: (currentTenant as any)?.hero_cta_secondary || "Our Services",
    aboutText: (currentTenant as any)?.about_text || "",
  });
  const [baseline, setBaseline] = useState({ ...settings });
  const isDirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(baseline), [settings, baseline]);

  const [bannerUrls, setBannerUrls] = useState<string[]>(currentTenant?.banner_urls || []);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [themePreviewOpen, setThemePreviewOpen] = useState(false);
  const [themePreviewKey, setThemePreviewKey] = useState<ThemeKey>("default");
  const [purchaseSuccessOpen, setPurchaseSuccessOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  // Re-seed when tenant loads / changes
  useEffect(() => {
    if (!currentTenant) return;
    const next = {
      bookingPageBio: currentTenant.booking_page_bio || "",
      brandColor: currentTenant.brand_color || "#2563EB",
      storefrontMode: (currentTenant.storefront_mode as "services" | "products" | "both") || "both",
      heroHeading: (currentTenant as any)?.hero_heading || "",
      heroTagline: (currentTenant as any)?.hero_tagline || "",
      heroBgColor: (currentTenant as any)?.hero_bg_color || "",
      heroCTAPrimary: (currentTenant as any)?.hero_cta_primary || "Book Now",
      heroCTASecondary: (currentTenant as any)?.hero_cta_secondary || "Our Services",
      aboutText: (currentTenant as any)?.about_text || "",
    };
    setSettings(next);
    setBaseline(next);
    setBannerUrls(currentTenant.banner_urls || []);
  }, [currentTenant?.id]);

  // Handle ?themepurchase=success redirect from Paystack
  useEffect(() => {
    const status = searchParams.get("themepurchase");
    if (status !== "success") return;
    const reference = searchParams.get("reference") || searchParams.get("trxref");
    if (!currentTenant?.id) return;

    const clean = new URLSearchParams(searchParams);
    clean.delete("themepurchase");
    clean.delete("reference");
    clean.delete("trxref");
    setSearchParams(clean, { replace: true });

    if (!reference) return;

    supabase.functions
      .invoke("verify-theme-purchase-payment", {
        body: { reference, tenantId: currentTenant.id },
      })
      .then(async ({ error }) => {
        if (error) {
          console.error("Theme purchase verification error:", error);
          toast({
            title: "Could not confirm payment",
            description: "Contact support if the theme doesn't activate shortly.",
            variant: "destructive",
          });
          return;
        }
        await refetchEntitlements();
        setPurchaseSuccessOpen(true);
      });
  }, [currentTenant?.id]);

  // ── derived ────────────────────��─────────────────────────────────────
  const hasPurchasedEcommerce = Boolean(entitlements?.has_ecommerce_theme);
  const activeThemeKey = (currentTenant as any)?.active_theme_key as ThemeKey || "default";
  const canPurchase = currentTenant?.subscription_status === "active";

  const bookingUrl = useMemo(() => {
    if (!currentTenant?.slug) return "";
    return `${BOOKING_URL_BASE}/?slug=${currentTenant.slug}`;
  }, [currentTenant?.slug]);

  const { data: ecommercePricing } = useQuery({
    queryKey: ["theme-addon-pricing", currentTenant?.country, currentTenant?.currency],
    enabled: Boolean(currentTenant?.country && currentTenant?.currency),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_addon_pricing" as any)
        .select("unit_price")
        .eq("theme_key", "ecommerce")
        .eq("country_code", currentTenant?.country || "")
        .eq("currency", currentTenant?.currency || "USD")
        .eq("status", "active")
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? Number((data as any).unit_price || 0) : 0;
    },
    staleTime: 60_000,
  });

  // ── handlers ────────────────────��─────────────────────────────��──────
  const handlePurchase = async () => {
    if (!currentTenant?.id) return;
    if (!canPurchase) {
      toast({
        title: "Upgrade required",
        description: "Finish upgrading from your trial before purchasing a paid theme.",
        variant: "destructive",
      });
      return;
    }
    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-theme-purchase-checkout-session",
        {
          body: {
            tenantId: currentTenant.id,
            themeKey: "ecommerce",
            successUrl: `${window.location.origin}/salon/themes-settings?themepurchase=success`,
            cancelUrl: `${window.location.origin}/salon/themes-settings?themepurchase=cancelled`,
          },
        },
      );
      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      // Charged immediately via stored card
      await refetchEntitlements();
      setPurchaseSuccessOpen(true);
    } catch (err) {
      toast({
        title: "Theme purchase failed",
        description: err instanceof Error ? err.message : "Unable to purchase the theme right now.",
        variant: "destructive",
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleApplyTheme = async (key: ThemeKey) => {
    if (!currentTenant?.id) return;
    setIsApplying(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({ active_theme_key: key })
        .eq("id", currentTenant.id);
      if (error) throw error;
      await refreshTenants();
      setPurchaseSuccessOpen(false);
      toast({
        title: key === "ecommerce" ? "E-commerce theme applied" : "Default theme restored",
        description:
          key === "ecommerce"
            ? "Your public booking page now uses the e-commerce layout."
            : "Your public booking page now uses the default layout.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to apply theme. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleSaveGeneral = async () => {
    if (!currentTenant?.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          booking_page_bio: settings.bookingPageBio || null,
          brand_color: settings.brandColor,
          storefront_mode: settings.storefrontMode,
          hero_heading: settings.heroHeading || null,
          hero_tagline: settings.heroTagline || null,
          hero_bg_color: settings.heroBgColor || null,
          hero_cta_primary: settings.heroCTAPrimary || "Book Now",
          hero_cta_secondary: settings.heroCTASecondary || "Our Services",
          about_text: settings.aboutText || null,
        })
        .eq("id", currentTenant.id);
      if (error) throw error;
      await refreshTenants();
      setBaseline({ ...settings });
      toast({ title: "Saved", description: "Theme settings updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!currentTenant?.id) return;
    if (bannerUrls.length >= 2) {
      toast({ title: "Error", description: "Maximum 2 banners allowed.", variant: "destructive" });
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Error", description: "Please upload a JPG, PNG, or WebP image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "File size must be under 5MB.", variant: "destructive" });
      return;
    }
    setIsUploadingBanner(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${currentTenant.id}/banner-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("salon-branding").upload(path, file);
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("salon-branding").getPublicUrl(path);
      const next = [...bannerUrls, urlData.publicUrl];
      const { error: updateErr } = await supabase.from("tenants").update({ banner_urls: next }).eq("id", currentTenant.id);
      if (updateErr) throw updateErr;
      setBannerUrls(next);
      await refreshTenants();
      toast({ title: "Success", description: "Banner uploaded." });
    } catch {
      toast({ title: "Error", description: "Failed to upload banner.", variant: "destructive" });
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleRemoveBanner = async (index: number) => {
    if (!currentTenant?.id) return;
    try {
      const next = bannerUrls.filter((_, i) => i !== index);
      const { error } = await supabase.from("tenants").update({ banner_urls: next }).eq("id", currentTenant.id);
      if (error) throw error;
      setBannerUrls(next);
      await refreshTenants();
      toast({ title: "Success", description: "Banner removed." });
    } catch {
      toast({ title: "Error", description: "Failed to remove banner.", variant: "destructive" });
    }
  };

  const previewLocations = (locations || []).map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    address: l.address,
  }));

  // ── render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Themes Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose and configure your public booking page appearance.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full max-w-sm">
          <TabsTrigger value="storefront" className="flex-1">Storefront Themes</TabsTrigger>
          <TabsTrigger value="general" className="flex-1">General Setup</TabsTrigger>
        </TabsList>

        {/* ─────────────────── STOREFRONT THEMES ─────────────────── */}
        <TabsContent value="storefront" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Preview and manage themes for your public booking page.
            </p>
            <Badge variant="outline" className="text-xs">
              Active: {activeThemeKey === "ecommerce" ? "E-commerce" : "Default"}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* ── Default theme card ── */}
            <div className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <p className="font-semibold">Default</p>
                    <Badge variant="secondary" className="text-[10px]">Free</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Clean, appointment-first booking page with your salon branding.
                  </p>
                </div>
                {activeThemeKey === "default" && <Badge className="shrink-0">Applied</Badge>}
              </div>

              <div className="flex-1">
                <BookingThemePreview
                  themeKey="default"
                  mode="card"
                  salonName={currentTenant?.name || "Your Salon"}
                  brandColor={settings.brandColor}
                  bannerUrls={bannerUrls}
                  bookingPageBio={settings.bookingPageBio || null}
                  storefrontMode={settings.storefrontMode}
                  locations={previewLocations}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setThemePreviewKey("default"); setThemePreviewOpen(true); }}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Preview
                </Button>
                {bookingUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`${bookingUrl}&preview_theme=default`, "_blank")}
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Live preview
                  </Button>
                )}
                {activeThemeKey !== "default" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApplyTheme("default")}
                    disabled={isApplying}
                  >
                    {isApplying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                    Apply
                  </Button>
                )}
              </div>
            </div>

            {/* ── E-commerce theme card ── */}
            <div className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <p className="font-semibold">E-commerce</p>
                    {hasPurchasedEcommerce ? (
                      <Badge variant="secondary" className="text-[10px]">Purchased</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Paid</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Shopify-inspired storefront for bookable services, packages, and products.
                  </p>
                  {ecommercePricing !== undefined && ecommercePricing > 0 && !hasPurchasedEcommerce && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCurrency(ecommercePricing, currentTenant?.currency || "USD")} / year
                    </p>
                  )}
                </div>
                {activeThemeKey === "ecommerce" && <Badge className="shrink-0">Applied</Badge>}
              </div>

              <div className="flex-1">
                <BookingThemePreview
                  themeKey="ecommerce"
                  mode="card"
                  salonName={currentTenant?.name || "Your Salon"}
                  brandColor={settings.brandColor}
                  bannerUrls={bannerUrls}
                  bookingPageBio={settings.bookingPageBio || null}
                  storefrontMode={settings.storefrontMode}
                  locations={previewLocations}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setThemePreviewKey("ecommerce"); setThemePreviewOpen(true); }}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Preview
                </Button>
                {bookingUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`${bookingUrl}&preview_theme=ecommerce`, "_blank")}
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Live preview
                  </Button>
                )}

                {!hasPurchasedEcommerce && (
                  <Button
                    size="sm"
                    onClick={handlePurchase}
                    disabled={isPurchasing || !canPurchase}
                    title={!canPurchase ? "Upgrade from trial first to purchase a paid theme" : undefined}
                  >
                    {isPurchasing ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Buy theme
                  </Button>
                )}

                {hasPurchasedEcommerce && activeThemeKey !== "ecommerce" && (
                  <Button
                    size="sm"
                    onClick={() => handleApplyTheme("ecommerce")}
                    disabled={isApplying}
                  >
                    {isApplying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                    Apply theme
                  </Button>
                )}

                {hasPurchasedEcommerce && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setActiveTab("general"); setSettingsDialogOpen(false); }}
                  >
                    <SettingsIcon className="mr-1.5 h-3.5 w-3.5" />
                    Settings
                  </Button>
                )}
              </div>

              {!canPurchase && !hasPurchasedEcommerce && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Upgrade from your trial first to purchase a paid theme.
                </p>
              )}
            </div>
          </div>

          {/* Coming soon cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { name: "Minimal", desc: "Ultra-clean, text-forward booking layout." },
              { name: "Luxury", desc: "Dark, editorial aesthetic for premium salons." },
            ].map((t) => (
              <div key={t.name} className="flex flex-col rounded-xl border border-dashed bg-muted/20 p-4 opacity-60">
                <div className="flex items-center gap-2 mb-1">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold text-muted-foreground">{t.name}</p>
                  <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ─────��───────────── GENERAL SETUP ─────��───────────── */}
        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>General Setup</CardTitle>
              <CardDescription>
                Configure your booking page bio, brand color, banners, and storefront focus.
                E-commerce hero settings apply when the e-commerce theme is active.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 xl:grid-cols-[1.2fr_1.8fr]">
                <div className="space-y-5">
                  {/* Banners */}
                  <div className="space-y-2">
                    <Label>Booking Page Banners</Label>
                    <p className="text-xs text-muted-foreground">Add up to 2 images for your booking page header.</p>
                    <div className="flex flex-wrap gap-3">
                      {bannerUrls.map((url, i) => (
                        <div key={i} className="group relative">
                          <div className="h-20 w-32 overflow-hidden rounded-lg border bg-muted">
                            <img src={url} alt={`Banner ${i + 1}`} className="h-full w-full object-cover" />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveBanner(i)}
                            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
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
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBannerUpload(f); }}
                          />
                          <button
                            type="button"
                            onClick={() => bannerInputRef.current?.click()}
                            disabled={isUploadingBanner}
                            className="flex h-20 w-32 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                          >
                            {isUploadingBanner ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <>
                                <ImageIcon className="h-5 w-5" />
                                <span className="text-xs">Add banner</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bio */}
                  <div className="space-y-1.5">
                    <Label>Storefront Bio</Label>
                    <Textarea
                      placeholder="A short description of your salon…"
                      value={settings.bookingPageBio}
                      onChange={(e) => setSettings((p) => ({ ...p, bookingPageBio: e.target.value }))}
                      rows={2}
                      maxLength={280}
                    />
                    <p className="text-xs text-muted-foreground">{settings.bookingPageBio.length}/280 characters.</p>
                  </div>

                  {/* Brand color */}
                  <div className="space-y-1.5">
                    <Label>Brand Highlight Color</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        value={settings.brandColor}
                        onChange={(e) => setSettings((p) => ({ ...p, brandColor: e.target.value }))}
                        className="h-10 w-16 cursor-pointer p-1"
                      />
                      <Input
                        type="text"
                        value={settings.brandColor}
                        onChange={(e) => setSettings((p) => ({ ...p, brandColor: e.target.value }))}
                        placeholder="#2563EB"
                        className="w-28 font-mono text-sm"
                      />
                      <div className="h-10 w-10 rounded-md border" style={{ backgroundColor: settings.brandColor }} />
                    </div>
                    <p className="text-xs text-muted-foreground">Used for buttons and accents on your booking page.</p>
                  </div>

                  {/* Storefront focus */}
                  <div className="space-y-1.5">
                    <Label>Storefront Focus</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { value: "both", label: "Both" },
                          { value: "services", label: "Services only" },
                          { value: "products", label: "Products only" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSettings((p) => ({ ...p, storefrontMode: opt.value }))}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                            settings.storefrontMode === opt.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted/40",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Packages are always included regardless of mode.
                    </p>
                  </div>

                  {/* E-commerce hero settings */}
                  <div className="space-y-3 rounded-xl border border-dashed p-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">E-commerce Hero</p>
                      {!hasPurchasedEcommerce && (
                        <Badge variant="outline" className="text-[10px]">Paid theme</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Hero copy and about section — shown when the e-commerce theme is active.
                    </p>

                    {hasPurchasedEcommerce && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Hero Panel Background</Label>
                        <div className="flex items-center gap-3">
                          <Input
                            type="color"
                            value={settings.heroBgColor || "#ffffff"}
                            onChange={(e) => setSettings((p) => ({ ...p, heroBgColor: e.target.value }))}
                            className="h-9 w-14 cursor-pointer p-1"
                          />
                          <Input
                            type="text"
                            value={settings.heroBgColor}
                            onChange={(e) => setSettings((p) => ({ ...p, heroBgColor: e.target.value }))}
                            placeholder="#ffffff (leave blank for white)"
                            className="flex-1 font-mono text-sm"
                          />
                          {settings.heroBgColor && (
                            <button
                              type="button"
                              onClick={() => setSettings((p) => ({ ...p, heroBgColor: "" }))}
                              className="text-xs text-muted-foreground underline hover:text-foreground"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Background color of the left panel in the e-commerce hero. Leave blank for white.
                        </p>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Hero Headline</Label>
                        <Input
                          placeholder="e.g. Hair By Gray Studios"
                          value={settings.heroHeading}
                          onChange={(e) => setSettings((p) => ({ ...p, heroHeading: e.target.value }))}
                          maxLength={80}
                        />
                        <p className="text-xs text-muted-foreground">Defaults to your salon name.</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Hero Accent Line</Label>
                        <Input
                          placeholder="e.g. … I come home"
                          value={settings.heroTagline}
                          onChange={(e) => setSettings((p) => ({ ...p, heroTagline: e.target.value }))}
                          maxLength={80}
                        />
                        <p className="text-xs text-muted-foreground">Colored second line of the headline.</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Primary Button</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(["Book Now", "Shop Now", "Get Started", "Explore"] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setSettings((p) => ({ ...p, heroCTAPrimary: opt }))}
                              className={cn(
                                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                                settings.heroCTAPrimary === opt
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background hover:bg-muted/40",
                              )}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Secondary Button</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(["Our Services", "New In", "Browse Catalog", "View All"] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setSettings((p) => ({ ...p, heroCTASecondary: opt }))}
                              className={cn(
                                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                                settings.heroCTASecondary === opt
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background hover:bg-muted/40",
                              )}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">About Section</Label>
                      <Textarea
                        placeholder="Tell your story — appears in the footer of your public storefront…"
                        value={settings.aboutText}
                        onChange={(e) => setSettings((p) => ({ ...p, aboutText: e.target.value }))}
                        rows={3}
                        maxLength={800}
                      />
                      <p className="text-xs text-muted-foreground">{settings.aboutText.length}/800 characters.</p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveGeneral} disabled={isSaving || !isDirty}>
                      {isSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save settings
                    </Button>
                  </div>
                </div>

                {/* Live preview */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Live Preview</Label>
                  <p className="text-xs text-muted-foreground">
                    Reflecting your current active theme: <span className="font-medium">{activeThemeKey === "ecommerce" ? "E-commerce" : "Default"}</span>
                  </p>
                  <BookingThemePreview
                    themeKey={activeThemeKey}
                    mode="dialog"
                    salonName={currentTenant?.name || "Your Salon"}
                    brandColor={settings.brandColor}
                    bannerUrls={bannerUrls}
                    bookingPageBio={settings.bookingPageBio || null}
                    storefrontMode={settings.storefrontMode}
                    locations={previewLocations}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Theme preview modal ── */}
      <Dialog open={themePreviewOpen} onOpenChange={setThemePreviewOpen}>
        <DialogContent className="z-[200] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {themePreviewKey === "ecommerce" ? "E-commerce theme" : "Default theme"} ��� how it looks to your customers
            </DialogTitle>
            <DialogDescription>
              A simulation using your salon's name, brand color, banners, and content.
            </DialogDescription>
          </DialogHeader>
          <BookingThemePreview
            themeKey={themePreviewKey}
            mode="dialog"
            salonName={currentTenant?.name || "Your Salon"}
            brandColor={settings.brandColor}
            bannerUrls={bannerUrls}
            bookingPageBio={settings.bookingPageBio || null}
            storefrontMode={settings.storefrontMode}
            locations={previewLocations}
          />
          {themePreviewKey === "ecommerce" && activeThemeKey !== "ecommerce" && (
            <DialogFooter>
              {!hasPurchasedEcommerce ? (
                <Button onClick={() => { setThemePreviewOpen(false); handlePurchase(); }} disabled={isPurchasing || !canPurchase}>
                  {isPurchasing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Buy theme
                </Button>
              ) : (
                <Button onClick={() => { setThemePreviewOpen(false); handleApplyTheme("ecommerce"); }} disabled={isApplying}>
                  {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Apply theme
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Purchase success modal ── */}
      <Dialog open={purchaseSuccessOpen} onOpenChange={setPurchaseSuccessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <DialogTitle>Theme purchased!</DialogTitle>
                <DialogDescription className="mt-0.5">
                  The e-commerce storefront theme is now in your library.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Next step: apply the theme</p>
            <p>
              Purchasing a theme doesn't activate it automatically. Click <strong>Apply theme</strong> below to switch
              your public booking page to the e-commerce layout.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setPurchaseSuccessOpen(false)}>
              Later
            </Button>
            <Button
              onClick={() => handleApplyTheme("ecommerce")}
              disabled={isApplying}
            >
              {isApplying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Apply theme now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
