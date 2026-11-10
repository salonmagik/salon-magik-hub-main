import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Globe2 } from "lucide-react";
import { COMMON_CURRENCIES, LEGAL_STATUS_OPTIONS } from "../utils";
import type { LegalStatus } from "../types";
import type { useMarketsCurrency } from "../hooks/useMarketsCurrency";

interface MarketsCurrencySectionProps {
  isSuperAdmin: boolean;
  markets: ReturnType<typeof useMarketsCurrency>;
}

export function MarketsCurrencySection({ isSuperAdmin, markets }: MarketsCurrencySectionProps) {
  const { selectedCountry, marketCountries, marketsLoading, selectableCountries } = markets;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-5 w-5" />
            Market Activation
          </CardTitle>
          <CardDescription>
            Control legal go-live, selectable countries, and currency policy. {selectableCountries} countries are selectable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[220px,1fr]">
            <div className="space-y-2">
              <Label>Country</Label>
              <Select
                value={markets.selectedCountryCode}
                onValueChange={(value) => {
                  markets.setSelectedCountryCode(value);
                  const country = marketCountries.find((row) => row.country_code === value);
                  markets.setNotesDraft(country?.notes || "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {marketCountries.map((country) => (
                    <SelectItem key={country.country_code} value={country.country_code}>
                      {country.country_name} ({country.country_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCountry && (
              <div className="space-y-4 rounded-md border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Legal Status</Label>
                    <Select
                      value={selectedCountry.legal_status}
                      onValueChange={(value) => markets.updateSelectedCountryLegalStatus(value as LegalStatus)}
                      disabled={!isSuperAdmin}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEGAL_STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <Label>Selectable in product forms</Label>
                      <p className="text-xs text-muted-foreground">Country appears in onboarding/signup selectors.</p>
                    </div>
                    <Switch
                      checked={selectedCountry.is_selectable}
                      onCheckedChange={(checked) => markets.updateSelectedCountrySelectable(checked)}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={markets.notesDraft}
                    onChange={(event) => markets.setNotesDraft(event.target.value)}
                    placeholder="Legal/compliance notes for this market"
                    disabled={!isSuperAdmin}
                  />
                </div>

                <Button
                  onClick={() => markets.saveMarketDetails(isSuperAdmin)}
                  disabled={!isSuperAdmin || markets.updateCountryMutation.isPending || marketsLoading}
                >
                  Save Market Changes
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Country Currency Policy</CardTitle>
          <CardDescription>
            Set one default currency per market and enable only the currencies you currently support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {markets.currenciesLoading ? (
            <p className="text-sm text-muted-foreground">Loading currencies...</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Add Currency</Label>
                  <Select value={markets.newCurrencyCode} onValueChange={markets.setNewCurrencyCode}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    markets.upsertCurrencyMutation.mutate({
                      countryCode: markets.selectedCountryCode,
                      currencyCode: markets.newCurrencyCode,
                    })
                  }
                  disabled={!isSuperAdmin || markets.upsertCurrencyMutation.isPending}
                >
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {markets.selectedCountryCurrencies.length === 0 && (
                  <p className="text-sm text-muted-foreground">No currencies configured for this country yet.</p>
                )}

                {markets.selectedCountryCurrencies.map((currency) => (
                  <div key={currency.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="font-medium">{currency.currency_code}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{currency.is_enabled ? "Enabled" : "Disabled"}</span>
                        {currency.is_default && <Badge variant="secondary">Default</Badge>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          markets.setDefaultCurrencyMutation.mutate({
                            countryCode: currency.country_code,
                            currencyCode: currency.currency_code,
                          })
                        }
                        disabled={!isSuperAdmin || markets.setDefaultCurrencyMutation.isPending}
                      >
                        Set Default
                      </Button>
                      <Switch
                        checked={currency.is_enabled}
                        onCheckedChange={(checked) =>
                          markets.toggleCurrencyMutation.mutate({ id: currency.id, isEnabled: checked })
                        }
                        disabled={!isSuperAdmin || markets.toggleCurrencyMutation.isPending}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
