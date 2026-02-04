import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { Checkbox } from "@/components/ui/checkbox";
import { validateSignup, type SignupField, type SignupFormData } from "@/pages/auth/signup/validation";

export default function SignupPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<SignupFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [touched, setTouched] = useState<Record<SignupField, boolean>>({
    firstName: false,
    lastName: false,
    email: false,
    phone: false,
    password: false,
    confirmPassword: false,
    terms: false,
  });

  const validation = useMemo(() => validateSignup(formData, acceptTerms), [formData, acceptTerms]);
  const isFormValid = validation.isValid;
  const hasInteracted = Object.values(touched).some(Boolean);

  const markTouched = (field: SignupField) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const shouldShowError = (field: SignupField) => touched[field];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    markTouched(name as SignupField);
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Button is disabled until valid, but keep this as a safety net.
    if (!validation.isValid) {
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/salon`,
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            full_name: `${formData.firstName} ${formData.lastName}`,
            phone: formData.phone,
          },
        },
      });

      if (error) {
        toast({
          title: "Signup failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Check your email",
          description:
            "We've sent you a confirmation link. Please verify your email to continue.",
        });
        navigate("/login");
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

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/onboarding`,
        },
      });

      if (error) {
        toast({
          title: "Google sign-in failed",
          description: error.message,
          variant: "destructive",
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

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your 14-day free trial. No credit card required."
    >
      {/* Google Sign Up */}
      <AuthButton
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        icon={
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        }
      >
        Continue with Google
      </AuthButton>

      <AuthDivider text="Or sign up with email" />

      {/* Signup Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AuthInput
            label="First name"
            type="text"
            name="firstName"
            placeholder="John"
            icon={<User size={18} />}
            value={formData.firstName}
            onChange={handleChange}
            onBlur={() => markTouched("firstName")}
            error={shouldShowError("firstName") ? validation.errors.firstName : undefined}
            disabled={isLoading}
          />

          <AuthInput
            label="Last name"
            type="text"
            name="lastName"
            placeholder="Doe"
            icon={<User size={18} />}
            value={formData.lastName}
            onChange={handleChange}
            onBlur={() => markTouched("lastName")}
            error={shouldShowError("lastName") ? validation.errors.lastName : undefined}
            disabled={isLoading}
          />
        </div>

        <AuthInput
          label="Email address"
          type="email"
          name="email"
          placeholder="Enter your email"
          icon={<Mail size={18} />}
          value={formData.email}
          onChange={handleChange}
          onBlur={() => markTouched("email")}
          error={shouldShowError("email") ? validation.errors.email : undefined}
          disabled={isLoading}
        />

        <AuthPhoneInput
          label="Phone number"
          value={formData.phone}
          onChange={(value) => {
            markTouched("phone");
            setFormData((prev) => ({ ...prev, phone: value }));
          }}
          error={shouldShowError("phone") ? validation.errors.phone : undefined}
          disabled={isLoading}
          defaultCountry="GH"
        />

        <AuthInput
          label="Password"
          type="password"
          name="password"
          placeholder="Create a password"
          icon={<Lock size={18} />}
          value={formData.password}
          onChange={handleChange}
          onBlur={() => markTouched("password")}
          error={shouldShowError("password") ? validation.errors.password : undefined}
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
          onBlur={() => markTouched("confirmPassword")}
          error={
            shouldShowError("confirmPassword") ? validation.errors.confirmPassword : undefined
          }
          disabled={isLoading}
        />

        <div className="space-y-2">
          <div className="flex items-start space-x-2">
            <Checkbox
              id="terms"
              checked={acceptTerms}
              onCheckedChange={(checked) => {
                markTouched("terms");
                setAcceptTerms(checked as boolean);
              }}
              className="mt-0.5"
            />
            <label
              htmlFor="terms"
              className="text-sm text-muted-foreground cursor-pointer leading-tight"
            >
              I agree to the{" "}
              <Link to="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </label>
          </div>
          {shouldShowError("terms") && validation.errors.terms && (
            <p className="text-sm text-destructive">{validation.errors.terms}</p>
          )}
        </div>

        <AuthButton
          type="submit"
          isLoading={isLoading}
          disabled={!isFormValid || isLoading}
        >
          Create account
        </AuthButton>

        {!isFormValid && hasInteracted && validation.blockingReason && (
          <p className="text-sm text-destructive">{validation.blockingReason}</p>
        )}
      </form>

      {/* Login Link */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
