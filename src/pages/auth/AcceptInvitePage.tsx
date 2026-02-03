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

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setValidationError("No invitation token provided");
        setIsValidating(false);
        return;
      }

      try {
        // Fetch invitation by token
        const { data, error } = await supabase
          .from("staff_invitations")
          .select("*, tenants(name)")
          .eq("token", token)
          .single();

        if (error || !data) {
          setValidationError("Invalid or expired invitation");
          setIsValidating(false);
          return;
        }

        // Check status
        if (data.status !== "pending") {
          setValidationError(
            data.status === "accepted"
              ? "This invitation has already been accepted"
              : "This invitation is no longer valid"
          );
          setIsValidating(false);
          return;
        }

        // Check expiry
        if (new Date(data.expires_at) < new Date()) {
          setValidationError("This invitation has expired");
          setIsValidating(false);
          return;
        }

        setInvitation({
          ...data,
          tenant_name: (data.tenants as any)?.name || "Unknown Salon",
        });
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
      // 1. Create the user account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/salon`,
          data: {
            first_name: invitation.first_name,
            last_name: invitation.last_name,
            full_name: `${invitation.first_name} ${invitation.last_name}`,
          },
        },
      });

      if (signUpError) {
        // User might already exist - try to sign in
        if (signUpError.message.includes("already registered")) {
          toast({
            title: "Account exists",
            description: "An account with this email already exists. Please sign in instead.",
            variant: "destructive",
          });
          navigate(`/login?email=${encodeURIComponent(invitation.email)}`);
          return;
        }
        throw signUpError;
      }

      const userId = signUpData.user?.id;
      if (!userId) throw new Error("Failed to create account");

      // 2. Create user role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: userId,
        tenant_id: invitation.tenant_id,
        role: invitation.role as any,
      });

      if (roleError) {
        console.error("Role creation error:", roleError);
        // Continue anyway - role might exist or will be created later
      }

      // 3. Update invitation status
      const { error: updateError } = await supabase
        .from("staff_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      if (updateError) {
        console.error("Invitation update error:", updateError);
      }

      toast({
        title: "Account created!",
        description: "Please check your email to verify your account.",
      });

      navigate("/login");
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
