import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { useToast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Shield, Mail, ArrowLeft, Send } from "lucide-react";

export default function BackofficeForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.functions.invoke("send-backoffice-password-reset", {
        body: {
          email: email.toLowerCase().trim(),
          origin: window.location.origin,
        },
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to send reset email",
          variant: "destructive",
        });
      } else {
        setIsSubmitted(true);
        toast({
          title: "Reset link sent",
          description: "Check your email for the password reset link.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex flex-col items-center">
            <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-success">
              <Mail className="h-5 w-5 text-success-foreground" />
            </div>
            <div className="text-lg font-bold text-foreground">Check your email</div>
            <div className="mt-0.5 text-center text-[12.5px] text-muted-foreground">
              We've sent a password reset link to your email address.
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-7">
            <p className="mb-5 text-[12.5px] text-muted-foreground">
              Click the link in your email to reset your password. If you don't see it, check your spam folder.
            </p>
            <div className="flex flex-col gap-2.5">
              <Button
                variant="outline"
                onClick={() => setIsSubmitted(false)}
                className="w-full rounded-full py-[11px] text-[13.5px] font-semibold"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Try another email
              </Button>
              <Link to="/login">
                <Button variant="ghost" className="w-full rounded-full py-[11px] text-[13.5px] font-semibold">
                  Back to sign in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="text-lg font-bold text-foreground">Reset password</div>
          <div className="mt-0.5 text-center text-[12.5px] text-muted-foreground">
            Enter your email and we'll send you a reset link.
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7">
          <form onSubmit={handleSubmit} className="space-y-0">
            <div className="mb-5">
              <Label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Work email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="example@salonmagik.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-auto rounded-[8px] border-input px-[13px] py-[11px] text-[13.5px]"
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-full py-[11px] text-[13.5px] font-semibold"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send reset link
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <ArrowLeft size={14} />
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
