import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { useToast } from "@ui/ui/use-toast";
import { Loader2, Shield, Eye, EyeOff } from "lucide-react";

export default function BackofficeLoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (error) {
        throw error;
      }

      // Auth provider will handle redirect based on TOTP status
      navigate("/", { replace: true });
    } catch (error: any) {
      console.error("Login error:", error);
      const message = error?.message || "Invalid credentials";
      setLoginError(message);
      toast({
        title: "Login failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="text-lg font-bold text-foreground">Salon Magik Backoffice</div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">Internal access only</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7">
          <div className="mb-[18px] text-base font-bold text-foreground">Sign in</div>

          <form onSubmit={handleLogin} className="space-y-0">
            {loginError && (
              <div className="mb-3.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loginError}
              </div>
            )}
            <div className="mb-3.5">
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
            <div className="mb-2">
              <Label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-auto rounded-[8px] border-input px-[13px] py-[11px] pr-10 text-[13.5px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="mb-5 text-right">
              <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-full py-[11px] text-[13.5px] font-semibold"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-[11.5px] text-muted-foreground/70">
          Restricted to @salonmagik.com accounts and approved sales-agent partners.
          <br />
          Every session requires two-factor authentication.
        </p>
      </div>
    </div>
  );
}
