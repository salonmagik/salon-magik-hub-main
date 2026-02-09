import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Phone } from "lucide-react";
import { useToast } from "@ui/use-toast";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { Checkbox } from "@ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";

type LoginMode = "email" | "phone";
type PhoneStep = "phone" | "otp";

export default function LoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>("email");
  
  // Email login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; phone?: string; otp?: string }>({});
  
  // Phone login state
  const [phone, setPhone] = useState("");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [otp, setOtp] = useState("");

  const validateEmailForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    if (!email) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Please enter a valid email";
    }
    
    if (!password) {
      newErrors.password = "Password is required";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePhoneForm = () => {
    const newErrors: { phone?: string } = {};
    
    if (!phone) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      newErrors.phone = "Please enter a valid phone number";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateOtpForm = () => {
    const newErrors: { otp?: string } = {};
    
    if (!otp || otp.length !== 6) {
      newErrors.otp = "Please enter the 6-digit code";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmailForm()) return;
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        navigate("/salon");
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

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePhoneForm()) return;
    
    setIsLoading(true);
    
    try {
      // Phone is already in E.164 format from PhoneInput
      const { error } = await supabase.auth.signInWithOtp({
        phone,
      });
      
      if (error) {
        toast({
          title: "Failed to send code",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Code sent!",
          description: "Please check your phone for the verification code.",
        });
        setPhoneStep("otp");
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

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateOtpForm()) return;
    
    setIsLoading(true);
    
    try {
      // Phone is already in E.164 format from PhoneInput
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: "sms",
      });
      
      if (error) {
        toast({
          title: "Verification failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        navigate("/salon");
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
        options: { redirectTo: window.location.origin },
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

  const resetPhoneFlow = () => {
    setPhoneStep("phone");
    setOtp("");
    setErrors({});
  };

  return (
    <AuthLayout 
      title="Welcome back"
      subtitle="Sign in to your salon management dashboard"
    >
      {/* Google Sign In */}
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

      <AuthDivider text="Or sign in with" />

      {/* Login Mode Tabs */}
      <Tabs value={loginMode} onValueChange={(v) => { setLoginMode(v as LoginMode); setErrors({}); resetPhoneFlow(); }} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="email" className="gap-2">
            <Mail size={16} />
            Email
          </TabsTrigger>
          <TabsTrigger value="phone" className="gap-2">
            <Phone size={16} />
            Phone
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Email Login Form */}
      {loginMode === "email" && (
        <form onSubmit={handleEmailSubmit} className="space-y-4 mt-4">
          <AuthInput
            label="Email address"
            type="email"
            placeholder="Enter your email"
            icon={<Mail size={18} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            disabled={isLoading}
          />

          <AuthInput
            label="Password"
            type="password"
            placeholder="Enter your password"
            icon={<Lock size={18} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            disabled={isLoading}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              />
              <label
                htmlFor="remember"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                Remember me
              </label>
            </div>
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:underline"
            >
              Forgot your password?
            </Link>
          </div>

          <AuthButton type="submit" isLoading={isLoading}>
            Sign in
          </AuthButton>
        </form>
      )}

      {/* Phone Login Form */}
      {loginMode === "phone" && phoneStep === "phone" && (
        <form onSubmit={handlePhoneSubmit} className="space-y-4 mt-4">
          <AuthPhoneInput
            label="Phone number"
            placeholder="812 345 6789"
            value={phone}
            onChange={setPhone}
            error={errors.phone}
            disabled={isLoading}
          />

          <AuthButton type="submit" isLoading={isLoading}>
            Send verification code
          </AuthButton>
        </form>
      )}

      {/* OTP Verification Form */}
      {loginMode === "phone" && phoneStep === "otp" && (
        <form onSubmit={handleOtpSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Enter the 6-digit code sent to {phone}
            </label>
            <div className="flex justify-center">
              <InputOTP
                value={otp}
                onChange={setOtp}
                maxLength={6}
                disabled={isLoading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            {errors.otp && (
              <p className="text-sm text-destructive text-center">{errors.otp}</p>
            )}
          </div>

          <AuthButton type="submit" isLoading={isLoading}>
            Verify & Sign in
          </AuthButton>

          <button
            type="button"
            onClick={resetPhoneFlow}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            Use a different phone number
          </button>
        </form>
      )}

      {/* Sign Up Link */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <Link to="/signup" className="text-primary font-medium hover:underline">
          Sign up for free
        </Link>
      </p>
    </AuthLayout>
  );
}
