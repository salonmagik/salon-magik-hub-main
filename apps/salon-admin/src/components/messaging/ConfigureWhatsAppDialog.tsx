import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Alert, AlertDescription } from "@ui/alert";
import {
  Loader2,
  AlertCircle,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";

interface ConfigureWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDeviceId: string | null;
  onDeviceIdChange?: () => void;
}

export function ConfigureWhatsAppDialog({
  open,
  onOpenChange,
  currentDeviceId,
  onDeviceIdChange,
}: ConfigureWhatsAppDialogProps) {
  const { currentTenant } = useAuth();
  const [deviceId, setDeviceId] = useState(currentDeviceId || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const charCount = deviceId.length;
  const isValidLength = charCount >= 3 && charCount <= 50;
  const isValidFormat = /^[a-zA-Z0-9_-]*$/.test(deviceId);
  const isValid = isValidLength && isValidFormat && deviceId.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid device ID (3-50 alphanumeric characters, hyphens, and underscores allowed)",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (!currentTenant?.id) {
        toast({ title: "Error", description: "No active tenant", variant: "destructive" });
        return;
      }

      const { error } = await supabase
        .from("tenants")
        .update({ contact_phone: deviceId.trim() })
        .eq("id", currentTenant.id);

      if (error) {
        console.error("Error updating device ID:", error);
        toast({
          title: "Update Failed",
          description: error.message || "Failed to update WhatsApp device ID",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Device ID Updated",
        description: "Your WhatsApp device ID has been successfully configured.",
      });

      // Trigger refetch
      if (onDeviceIdChange) {
        onDeviceIdChange();
      }

      onOpenChange(false);
    } catch (err) {
      console.error("Error:", err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MessageCircle className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <DialogTitle>WhatsApp Device Configuration</DialogTitle>
              <DialogDescription>
                Configure your Termii WhatsApp device for messaging
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Device ID Input */}
          <div className="space-y-2">
            <Label htmlFor="deviceId">
              Device ID <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="deviceId"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="e.g., device-abc123"
                maxLength={50}
                className={
                  deviceId && !isValid ? "border-destructive focus-visible:ring-destructive" : ""
                }
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {charCount}/50
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <div>
                <p>Must be 3-50 characters (letters, numbers, hyphens, and underscores allowed)</p>
                {!isValidFormat && deviceId && (
                  <p className="text-destructive mt-1">
                    Only letters, numbers, hyphens, and underscores are allowed
                  </p>
                )}
                {!isValidLength && deviceId && (
                  <p className="text-destructive mt-1">
                    Must be between 3 and 50 characters
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Info Alert */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <p className="font-medium mb-1">How to get your device ID:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Log in to your Termii dashboard</li>
                <li>Navigate to WhatsApp → Devices</li>
                <li>Copy your device ID from the list</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Current Device ID Display */}
          {currentDeviceId && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="text-muted-foreground mb-1">Current Device ID:</p>
              <p className="font-mono font-medium">{currentDeviceId}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              className="flex-1"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {currentDeviceId ? "Update Device ID" : "Save Device ID"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>

          {/* Documentation link */}
          <div className="pt-2 border-t">
            <a
              href="https://developer.termii.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              Learn more about Termii WhatsApp Devices
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
