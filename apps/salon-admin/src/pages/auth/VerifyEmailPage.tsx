import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import { Button } from "@ui/button";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [isVerifying, setIsVerifying] = useState(true);
  const [status, setStatus] = useState<"success" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [verifiedEmail, setVerifiedEmail] = useState<string>("");

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
          <div className="pt-4 space-y-2">
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Go to Login
              </Button>
            </Link>
            <Link to="/signup">
              <Button variant="ghost" className="w-full">
                Sign up again
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
