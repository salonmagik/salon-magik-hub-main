import { useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";

import { useSafetyControls } from "./hooks/useSafetyControls";
import { useTrialsPromotions } from "./hooks/useTrialsPromotions";
import { useLiveBalances } from "./hooks/useLiveBalances";
import { useMarketsCurrency } from "./hooks/useMarketsCurrency";

import { SafetyControlsSection } from "./components/SafetyControlsSection";
import { TrialsPromotionsSection } from "./components/TrialsPromotionsSection";
import { LiveBalancesSection } from "./components/LiveBalancesSection";
import { MarketsCurrencySection } from "./components/MarketsCurrencySection";
import { KillSwitchConfirmDialog } from "./components/dialogs/KillSwitchConfirmDialog";
import { MaintenanceBannerConfirmDialog } from "./components/dialogs/MaintenanceBannerConfirmDialog";

import type { SettingsSection } from "./types";

const settingsSections: { key: SettingsSection; label: string; description: string }[] = [
  { key: "safety", label: "Safety controls", description: "Emergency switches and platform-wide banners. Every toggle here is logged and most require 2FA to confirm." },
  { key: "trials", label: "Trials & promotions", description: "Everything that changes how long — or how cheap — a trial is, in one place." },
  { key: "balances", label: "Live balances", description: "Real-time reads from Arkesel and Paystack — not anything Salon Magik stores itself." },
  { key: "markets", label: "Markets & currency", description: "Every add-on in Pricing catalog reads this list directly — adding a market here is the only step needed for it to show up everywhere pricing is configured." },
];

export default function BackofficeSettingsPage() {
  const { backofficeUser, profile, session } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [activeSection, setActiveSection] = useState<SettingsSection>("safety");

  const safety = useSafetyControls(backofficeUser, session, profile?.full_name, isSuperAdmin);
  const trials = useTrialsPromotions(backofficeUser);
  const balances = useLiveBalances();
  const markets = useMarketsCurrency(backofficeUser);

  const activeSectionMeta = settingsSections.find((s) => s.key === activeSection)!;

  return (
    <BackofficeLayout>
      <div className="flex min-h-[calc(100vh-4rem)] gap-0">
        <aside className="w-[230px] shrink-0 border-r border-border bg-card p-3.5 pt-6">
          <div className="px-2.5 pb-4 text-lg font-bold">Settings</div>
          <nav className="flex flex-col gap-0.5">
            {settingsSections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeSection === section.key
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="max-w-[900px] flex-1 space-y-6 p-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{activeSectionMeta.label}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{activeSectionMeta.description}</p>
          </div>

          {activeSection === "safety" && (
            <SafetyControlsSection
              isSuperAdmin={isSuperAdmin}
              safety={safety}
              profileFullName={profile?.full_name}
              role={backofficeUser?.role}
              emailDomain={backofficeUser?.email_domain}
              totpEnabled={backofficeUser?.totp_enabled}
            />
          )}

          {activeSection === "trials" && (
            <TrialsPromotionsSection isSuperAdmin={isSuperAdmin} trials={trials} />
          )}

          {activeSection === "balances" && <LiveBalancesSection balances={balances} />}

          {activeSection === "markets" && (
            <MarketsCurrencySection isSuperAdmin={isSuperAdmin} markets={markets} />
          )}
        </div>
      </div>

      <KillSwitchConfirmDialog safety={safety} />
      <MaintenanceBannerConfirmDialog safety={safety} />
    </BackofficeLayout>
  );
}
