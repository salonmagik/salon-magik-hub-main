import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError("Email is required");
      return;
    }
    
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setIsSubmitted(true);
        toast({
          title: "Reset link sent",
          description: "Check your email for the password reset link.",
        });
      }
    } catch (error) {
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
      <AuthLayout
        title="Check your email"
        subtitle="We've sent a password reset link to your email address."
      >
        <AuthCard className="text-center">
          <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-success" />
          </div>
          <p className="text-muted-foreground mb-6">
            Click the link in your email to reset your password. If you don't see it, check your spam folder.
          </p>
          <AuthButton
            variant="outline"
            onClick={() => setIsSubmitted(false)}
            icon={<ArrowLeft size={18} />}
          >
            Try another email
          </AuthButton>
        </AuthCard>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="No worries! Enter your email and we'll send you a reset link."
    >
      <AuthCard>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthInput
            label="Email address"
            type="email"
            placeholder="Enter your email address"
            icon={<Mail size={18} />}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            error={error}
            disabled={isLoading}
          />

          <AuthButton
            type="submit"
            isLoading={isLoading}
            icon={<Send size={18} />}
          >
            Send reset link
          </AuthButton>
        </form>

        <p className="mt-4 text-center">
          <Link to="/login" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </AuthCard>

      {/* Support Note */}
      <AuthCard className="mt-4 text-center bg-surface border-0">
        <p className="text-sm text-muted-foreground">
          <strong className="text-primary">Need help?</strong> Contact our support team at{" "}
          <a href="mailto:support@salonmagik.com" className="text-primary hover:underline">
            support@salonmagik.com
          </a>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
