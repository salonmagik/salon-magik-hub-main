import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePayoutDestinations, type PayoutDestination } from "@/hooks/usePayoutDestinations";
import { useBankList, type Bank } from "@/hooks/useBankList";
import { useAccountVerification } from "@/hooks/useAccountVerification";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Building, Smartphone } from "lucide-react";
import { Badge } from "@ui/badge";
import { cn } from "@shared/utils";

export function PayoutDestinationsManager() {
  const { currentTenant } = useAuth();
  const { destinations, isLoading, createDestination, deleteDestination } = usePayoutDestinations(currentTenant?.id);
  
  const [showForm, setShowForm] = useState(false);
  const [country, setCountry] = useState<"NG" | "GH">("NG");
  const [destinationType, setDestinationType] = useState<"bank" | "mobile_money">("bank");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { banks, isLoading: banksLoading } = useBankList(
    country,
    destinationType === "mobile_money" ? "mobile_money" : undefined
  );
  
  const { verify, reset, isVerifying, result } = useAccountVerification();

  const currency = currentTenant?.currency || "NGN";

  // Reset form when country or destination type changes
  useEffect(() => {
    setSelectedBank("");
    setAccountNumber("");
    setAccountName("");
    reset();
  }, [country, destinationType, reset]);

  // Set country based on tenant currency
  useEffect(() => {
    if (currency === "GHS") {
      setCountry("GH");
    } else {
      setCountry("NG");
    }
  }, [currency]);

  const handleVerifyAccount = async () => {
    if (!accountNumber || !selectedBank) return;

    const selectedBankData = banks.find((b) => b.code === selectedBank);
    if (!selectedBankData) return;

    const verificationResult = await verify(accountNumber, selectedBankData.code);
    if (verificationResult.verified && verificationResult.accountName) {
      setAccountName(verificationResult.accountName);
    }
  };

  const handleSaveDestination = async () => {
    if (!currentTenant?.id) return;

    const selectedBankData = banks.find((b) => b.code === selectedBank);
    if (!selectedBankData) return;

    setIsSaving(true);

    const destinationData = {
      tenantId: currentTenant.id,
      destinationType,
      country,
      currency,
      ...(destinationType === "bank"
        ? {
            bankCode: selectedBankData.code,
            bankName: selectedBankData.name,
            accountNumber,
            accountName,
          }
        : {
            momoProvider: selectedBankData.code,
            momoNumber: accountNumber,
            accountName,
          }),
      isDefault,
    };

    const created = await createDestination(destinationData);
    
    setIsSaving(false);

    if (created) {
      // Reset form
      setShowForm(false);
      setSelectedBank("");
      setAccountNumber("");
      setAccountName("");
      setIsDefault(false);
      reset();
    }
  };

  const handleDeleteDestination = async (id: string) => {
    if (confirm("Are you sure you want to delete this payout destination?")) {
      await deleteDestination(id);
    }
  };

  const isAccountNumberValid = () => {
    if (!accountNumber) return false;
    // Nigeria bank accounts are 10 digits
    if (country === "NG" && destinationType === "bank") {
      return /^\d{10}$/.test(accountNumber);
    }
    // For mobile money and Ghana, just check it's not empty
    return accountNumber.length > 0;
  };

  const canVerify = destinationType === "bank" && selectedBank && isAccountNumberValid();
  const canSave = result?.verified && accountName && selectedBank && isAccountNumberValid();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payout Destinations</CardTitle>
          <CardDescription>
            Manage your bank accounts and mobile money numbers for receiving withdrawals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Existing destinations list */}
              {destinations.length > 0 ? (
                <div className="space-y-3">
                  {destinations.map((dest) => (
                    <DestinationCard
                      key={dest.id}
                      destination={dest}
                      onDelete={handleDeleteDestination}
                    />
                  ))}
                </div>
              ) : !showForm ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No payout destinations configured</p>
                  <p className="text-sm mt-1">Add a destination to enable withdrawals</p>
                </div>
              ) : null}

              {/* Add destination form */}
              {showForm ? (
                <Card className="border-dashed">
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Select value={country} onValueChange={(v) => setCountry(v as "NG" | "GH")}>
                          <SelectTrigger id="country">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NG">Nigeria</SelectItem>
                            <SelectItem value="GH">Ghana</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="type">Type</Label>
                        <Select
                          value={destinationType}
                          onValueChange={(v) => setDestinationType(v as "bank" | "mobile_money")}
                        >
                          <SelectTrigger id="type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank">Bank Account</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bank">
                        {destinationType === "bank" ? "Bank" : "Mobile Money Provider"}
                      </Label>
                      <Select value={selectedBank} onValueChange={setSelectedBank} disabled={banksLoading}>
                        <SelectTrigger id="bank">
                          <SelectValue placeholder={banksLoading ? "Loading..." : "Select..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {banks.map((bank) => (
                            <SelectItem key={bank.code} value={bank.code}>
                              {bank.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="accountNumber">
                        {destinationType === "bank" ? "Account Number" : "Mobile Number"}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="accountNumber"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          placeholder={
                            country === "NG" && destinationType === "bank"
                              ? "10-digit account number"
                              : "Enter number"
                          }
                        />
                        {destinationType === "bank" && (
                          <Button
                            type="button"
                            onClick={handleVerifyAccount}
                            disabled={!canVerify || isVerifying}
                            variant="outline"
                          >
                            {isVerifying ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Verify"
                            )}
                          </Button>
                        )}
                      </div>
                      {country === "NG" && destinationType === "bank" && accountNumber && !isAccountNumberValid() && (
                        <p className="text-xs text-destructive">Account number must be 10 digits</p>
                      )}
                    </div>

                    {/* Verification result */}
                    {result && (
                      <div
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-md text-sm",
                          result.verified ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        )}
                      >
                        {result.verified ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Verified: {result.accountName}</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4" />
                            <span>{result.error || "Verification failed"}</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Account name field (read-only after verification) */}
                    {result?.verified && accountName && (
                      <div className="space-y-2">
                        <Label htmlFor="accountName">Account Name</Label>
                        <Input
                          id="accountName"
                          value={accountName}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    )}

                    {/* Manual account name for mobile money */}
                    {destinationType === "mobile_money" && (
                      <div className="space-y-2">
                        <Label htmlFor="accountName">Account Name</Label>
                        <Input
                          id="accountName"
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          placeholder="Enter account holder name"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isDefault"
                        checked={isDefault}
                        onChange={(e) => setIsDefault(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="isDefault" className="font-normal">
                        Set as default payout destination
                      </Label>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowForm(false);
                          setSelectedBank("");
                          setAccountNumber("");
                          setAccountName("");
                          setIsDefault(false);
                          reset();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveDestination}
                        disabled={!canSave || isSaving}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Destination"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Button onClick={() => setShowForm(true)} variant="outline" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Destination
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface DestinationCardProps {
  destination: PayoutDestination;
  onDelete: (id: string) => void;
}

function DestinationCard({ destination, onDelete }: DestinationCardProps) {
  const isBank = destination.destination_type === "bank";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {isBank ? (
                <Building className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Smartphone className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  {isBank ? destination.bank_name : destination.momo_provider}
                </p>
                {destination.is_default && (
                  <Badge variant="secondary" className="text-xs">
                    Default
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {destination.account_name}
              </p>
              <p className="text-sm font-mono text-muted-foreground">
                {isBank ? destination.account_number : destination.momo_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {destination.country} · {destination.currency}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(destination.id)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
