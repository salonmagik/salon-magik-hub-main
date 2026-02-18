import { useState } from "react";
import { Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
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
import { useToast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";

interface ForcePasswordChangeDialogProps {
  open: boolean;
  onPasswordChanged: () => void;
}

export function ForcePasswordChangeDialog({
  open,
  onPasswordChanged,
}: ForcePasswordChangeDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  // Password requirements
  const requirements = [
    { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
    { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
    { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
    { label: "One number", test: (p: string) => /\d/.test(p) },
    { label: "One special character", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
  ];

  const allRequirementsMet = requirements.every((req) => req.test(password));

  const validate = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      newErrors.password = "Password is required";
    } else if (!allRequirementsMet) {
      newErrors.password = "Password does not meet requirements";
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);

    try {
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      const {
        data: { session: refreshedSession },
      } = await supabase.auth.refreshSession();
      const session = refreshedSession ?? existingSession;
      
      if (!session?.access_token) {
        toast({
          title: "Session expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke("complete-password-change", {
        body: { newPassword: password },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error || data?.error) {
        toast({
          title: "Error",
          description: data?.error || error?.message || "Failed to change password",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });

      // Refresh the session to get updated metadata
      await supabase.auth.refreshSession();
      
      onPasswordChanged();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent 
        className="sm:max-w-md" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Set Your Password
          </DialogTitle>
          <DialogDescription>
            Welcome! Please set a permanent password to secure your account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={errors.password ? "border-destructive" : ""}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={errors.confirmPassword ? "border-destructive" : ""}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword}</p>
            )}
          </div>

          {/* Password requirements checklist */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium mb-2">Password requirements:</p>
            <ul className="space-y-1">
              {requirements.map((req, index) => {
                const met = req.test(password);
                return (
                  <li
                    key={index}
                    className={`flex items-center gap-2 text-sm ${
                      met ? "text-green-600" : "text-muted-foreground"
                    }`}
                  >
                    <CheckCircle2 
                      className={`h-4 w-4 ${met ? "text-green-600" : "text-muted-foreground/50"}`} 
                    />
                    {req.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || !allRequirementsMet || password !== confirmPassword}
          >
            {isLoading ? "Updating..." : "Set Password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
