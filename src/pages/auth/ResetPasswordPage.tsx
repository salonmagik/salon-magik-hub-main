import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";

// Password strength validation (same as SignupPage)
import { isValidPassword } from "@/lib/form-utils";

const validatePasswordStrength = (password: string): string | null => {
  const result = isValidPassword(password);
  return result.valid ? null : result.error || "Invalid password";
};

type PageState = "loading" | "invalid" | "form" | "success";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [pageState, setPageState] = useState<PageState>("loading");
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setPageState("invalid");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("verify-reset-token", {
          body: { token },
        });

        if (error || !data?.valid) {
          setPageState("invalid");
          return;
        }

        setEmail(data.email);
        setPageState("form");
      } catch (err) {
        console.error("Token verification error:", err);
        setPageState("invalid");
      }
    };

    verifyToken();
  }, [token]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else {
      const strengthError = validatePasswordStrength(formData.password);
      if (strengthError) {
        newErrors.password = strengthError;
      }
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !token) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("complete-password-reset", {
        body: { token, password: formData.password },
      });

      if (error || !data?.success) {
        toast({
          title: "Error",
          description: data?.error || error?.message || "Failed to reset password",
          variant: "destructive",
        });
      } else {
        // Sign out any existing session
        await supabase.auth.signOut();
        setPageState("success");
        toast({
          title: "Password updated",
          description: "Your password has been successfully reset.",
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

  // Loading state
  if (pageState === "loading") {
    return (
      <AuthLayout title="Reset your password" subtitle="Verifying your reset link...">
        <AuthCard className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </AuthCard>
      </AuthLayout>
    );
  }

  // Invalid or expired link
  if (pageState === "invalid") {
    return (
      <AuthLayout
        title="Invalid or expired link"
        subtitle="This password reset link is no longer valid."
      >
        <AuthCard className="text-center">
          <p className="text-muted-foreground mb-6">
            Password reset links expire after 1 hour for security reasons.
            Please request a new link.
          </p>
          <AuthButton
            variant="outline"
            onClick={() => navigate("/forgot-password")}
            icon={<ArrowLeft size={18} />}
          >
            Request new link
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

  // Success state
  if (pageState === "success") {
    return (
      <AuthLayout
        title="Password reset successful"
        subtitle="Your password has been updated."
      >
        <AuthCard className="text-center">
          <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <p className="text-muted-foreground mb-6">
            You can now sign in with your new password.
          </p>
          <AuthButton onClick={() => navigate("/login")}>
            Sign in
          </AuthButton>
        </AuthCard>
      </AuthLayout>
    );
  }

  // Reset password form
  return (
    <AuthLayout
      title="Create new password"
      subtitle={email ? `Resetting password for ${email}` : "Enter a strong password for your account."}
    >
      <AuthCard>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthInput
            label="New password"
            type="password"
            name="password"
            placeholder="Enter new password"
            icon={<Lock size={18} />}
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            disabled={isLoading}
          />

          <AuthInput
            label="Confirm password"
            type="password"
            name="confirmPassword"
            placeholder="Confirm new password"
            icon={<Lock size={18} />}
            value={formData.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
            disabled={isLoading}
          />

          {/* Password requirements */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Password must:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>Be at least 8 characters long</li>
              <li>Contain at least one lowercase letter</li>
              <li>Contain at least one uppercase letter</li>
              <li>Contain at least one number</li>
              <li>Contain at least one special character (!@#$%^&*...)</li>
              <li>Not be a simple pattern</li>
            </ul>
          </div>

          <AuthButton type="submit" isLoading={isLoading}>
            Reset password
          </AuthButton>
        </form>
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
