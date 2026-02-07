import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { Lock, Loader2, CheckCircle, XCircle } from "lucide-react";
import { isValidPassword } from "@/lib/form-utils";
import { Badge } from "@/components/ui/badge";

interface InvitationDetails {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  expires_at: string;
  tenant_name?: string;
}

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [isValidating, setIsValidating] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validate token on mount using edge function
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setValidationError("No invitation token provided");
        setIsValidating(false);
        return;
      }

      try {
        // Use edge function to validate token (bypasses RLS)
        const { data, error } = await supabase.functions.invoke("validate-staff-invitation", {
          body: { token },
        });

        if (error) {
          setValidationError(error.message || "Invalid or expired invitation");
          setIsValidating(false);
          return;
        }

        if (data?.error) {
          setValidationError(data.error);
          setIsValidating(false);
          return;
        }

        setInvitation(data as InvitationDetails);
      } catch (err) {
        console.error("Validation error:", err);
        setValidationError("Failed to validate invitation");
      } finally {
        setIsValidating(false);
      }
    }

    validateToken();
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else {
      const passwordValidation = isValidPassword(formData.password);
      if (!passwordValidation.valid) {
        newErrors.password = passwordValidation.error || "Invalid password";
      }
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isFormValid =
    formData.password.length >= 8 &&
    isValidPassword(formData.password).valid &&
    formData.password === formData.confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !invitation) return;

    setIsLoading(true);

    try {
      // Use the accept-staff-invitation edge function to create user with auto-confirmed email
      const { data, error } = await supabase.functions.invoke("accept-staff-invitation", {
        body: {
          token: token,
          password: formData.password,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to create account");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Account created!",
        description: "You can now sign in with your credentials.",
      });

      // Redirect to login with email pre-filled
      navigate(`/login?email=${encodeURIComponent(invitation.email)}`);
    } catch (error: any) {
      console.error("Accept invite error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <AuthLayout title="Validating invitation..." subtitle="Please wait while we verify your invitation.">
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  if (validationError) {
    return (
      <AuthLayout title="Invalid Invitation" subtitle="">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-muted-foreground">{validationError}</p>
          <Link to="/login" className="text-primary hover:underline text-sm">
            Go to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (!invitation) {
    return null;
  }

  return (
    <AuthLayout
      title="Join the team"
      subtitle={`You've been invited to join ${invitation.tenant_name}`}
    >
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-primary" />
        </div>
        <p className="text-lg font-medium">
          Welcome, {invitation.first_name}!
        </p>
        <Badge variant="secondary" className="mt-2 capitalize">
          {invitation.role}
        </Badge>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput
          label="Password"
          type="password"
          name="password"
          placeholder="Create a password"
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
          placeholder="Confirm your password"
          icon={<Lock size={18} />}
          value={formData.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          disabled={isLoading}
        />

        <AuthButton type="submit" isLoading={isLoading} disabled={!isFormValid || isLoading}>
          Create Account
        </AuthButton>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
