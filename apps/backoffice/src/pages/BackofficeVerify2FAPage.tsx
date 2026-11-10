import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBackofficeAuth } from "@/hooks";
import { Button } from "@ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import { useToast } from "@ui/ui/use-toast";
import { Loader2, Shield } from "lucide-react";
import { cn } from "@shared/utils";

export default function BackofficeVerify2FAPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { verifyTotp, signOut, profile } = useBackofficeAuth();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) return;

    setIsLoading(true);
    try {
      const success = await verifyTotp(code);

      if (success) {
        navigate("/", { replace: true });
      } else {
        toast({
          title: "Invalid code",
          description: "Please check your authenticator app and try again.",
          variant: "destructive",
        });
        setCode("");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="text-lg font-bold text-foreground">Two-factor verification</div>
          <div className="mt-0.5 text-center text-[12.5px] text-muted-foreground">
            {profile?.full_name ? `Welcome back, ${profile.full_name.split(" ")[0]}. ` : ""}
            Enter the 6-digit code from your authenticator app
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7">
          <div className="mb-[22px] flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={handleVerify} disabled={isLoading}>
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className={cn(
                      "h-14 w-12 rounded-[8px] border-l text-xl font-bold",
                      code.length > i && "border-primary bg-primary/10",
                    )}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            onClick={handleVerify}
            disabled={isLoading || code.length !== 6}
            className="w-full rounded-full py-[11px] text-[13.5px] font-semibold"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify &amp; continue
          </Button>

          <div className="mt-4 flex flex-col items-center gap-1.5">
            <Button
              variant="link"
              onClick={handleSignOut}
              className="h-auto p-0 text-xs font-semibold text-primary"
            >
              Use a different account
            </Button>
            <span className="text-[11.5px] text-muted-foreground/70">Protected by two-factor authentication</span>
          </div>
        </div>
      </div>
    </div>
  );
}
