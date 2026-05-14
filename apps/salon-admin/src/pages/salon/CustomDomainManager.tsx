import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@ui/ui/use-toast";

export function CustomDomainManager() {
  const { currentTenant } = useAuth();
  const [searchDomain, setSearchDomain] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<any>(null);

  const checkAvailability = async () => {
    if (!searchDomain) return;
    setIsSearching(true);
    setAvailabilityResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("dotlet-check-domain-availability", {
        body: { domain: searchDomain },
      });

      if (error) throw error;
      setAvailabilityResult(data);
    } catch (err: any) {
      console.error("Domain search error:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to check domain availability.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Domain</CardTitle>
        <CardDescription>
          Search for and register a custom domain for your booking site.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Find a Domain</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. mysalon.com"
                value={searchDomain}
                onChange={(e) => setSearchDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") checkAvailability();
                }}
              />
              <Button onClick={checkAvailability} disabled={isSearching || !searchDomain}>
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Check
              </Button>
            </div>
          </div>

          {availabilityResult && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {availabilityResult.available ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive" />
                  )}
                  <div>
                    <p className="font-medium">{searchDomain.toLowerCase()}</p>
                    <p className="text-sm text-muted-foreground">
                      {availabilityResult.available ? "Available" : "Not available"}
                    </p>
                  </div>
                </div>
                {availabilityResult.available && availabilityResult.price && (
                  <div className="text-right">
                    <p className="font-medium text-lg">
                      {availabilityResult.currency === "USD" ? "$" : ""}
                      {(availabilityResult.price / 100).toFixed(2)}
                      {availabilityResult.currency !== "USD" ? ` ${availabilityResult.currency}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">per year</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
