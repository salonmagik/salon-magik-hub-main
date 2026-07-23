import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import { Button } from "@ui/button";
import { useToast } from "@ui/use-toast";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();

  const [isVerifying, setIsVerifying] = useState(true);
  const [status, setStatus] = useState<"success" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [verifiedEmail, setVerifiedEmail] = useState<string>("");
  const [resendEmail, setResendEmail] = useState<string>("");
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    async function verifyEmail() {
      if (!token) {
        setStatus("error");
        setErrorMessage("No verification token provided");
        setIsVerifying(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("verify-email", {
          body: { token },
        });

        if (error) {
          throw new Error(error.message || "Verification failed");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        setVerifiedEmail(data?.email || "");
        setStatus("success");
      } catch (err: any) {
        console.error("Verification error:", err);
        setStatus("error");
        setErrorMessage(err.message || "Failed to verify email");
      } finally {
        setIsVerifying(false);
      }
    }

    verifyEmail();
  }, [token]);

  const handleResend = async () => {
    if (!resendEmail) return;
    setIsResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-verification", {
        body: { mode: "resend", email: resendEmail, origin: window.location.origin },
      });
      if (error || data?.error) {
        toast({ title: "Resend failed", description: data?.error || error?.message || "Try again shortly.", variant: "destructive" });
      } else {
        toast({ title: "Verification email sent", description: `Check ${resendEmail} for a new confirmation link.` });
      }
    } catch {
      toast({ title: "Error", description: "Could not resend. Please try again.", variant: "destructive" });
    } finally {
      setIsResending(false);
    }
  };

  if (isVerifying) {
    return (
      <AuthLayout title="Verifying your email..." subtitle="Please wait while we confirm your email address.">
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  if (status === "error") {
    return (
      <AuthLayout title="Verification Failed" subtitle="">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-muted-foreground">{errorMessage}</p>
          <p className="text-sm text-muted-foreground">
            The link may have expired or already been used.
          </p>
          <div className="pt-2 space-y-3">
            <div className="space-y-1.5 text-left">
              <label className="text-sm font-medium text-foreground">Resend to your email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={!resendEmail || isResending}
                  onClick={handleResend}
                >
                  {isResending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Resend"}
                </Button>
              </div>
            </div>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Go to Login
              </Button>
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Email Verified!" subtitle="">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-success/10 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <div>
          <p className="text-lg font-medium">Your email has been verified</p>
          {verifiedEmail && (
            <p className="text-muted-foreground flex items-center justify-center gap-2 mt-2">
              <Mail className="w-4 h-4" />
              {verifiedEmail}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          You can now sign in to your account and start using Salon Magik.
        </p>
        <div className="pt-4">
          <Link to="/login">
            <Button className="w-full">
              Sign in to your account
            </Button>
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
