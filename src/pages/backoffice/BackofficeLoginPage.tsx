import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
 import { supabase } from "@/integrations/supabase/client";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { useToast } from "@/hooks/use-toast";
 import { Loader2, Shield, Eye, EyeOff } from "lucide-react";
 
 export default function BackofficeLoginPage() {
   const navigate = useNavigate();
   const { toast } = useToast();
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [showPassword, setShowPassword] = useState(false);
   const [isLoading, setIsLoading] = useState(false);
 
   const handleLogin = async (e: React.FormEvent) => {
     e.preventDefault();
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
       navigate("/backoffice", { replace: true });
     } catch (error: any) {
       console.error("Login error:", error);
       toast({
         title: "Login failed",
         description: error.message || "Invalid credentials",
         variant: "destructive",
       });
     } finally {
       setIsLoading(false);
     }
   };
 
   return (
     <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
       <Card className="w-full max-w-md">
         <CardHeader className="text-center">
           <div className="mx-auto mb-4 rounded-full bg-destructive/10 p-3 w-fit">
             <Shield className="h-8 w-8 text-destructive" />
           </div>
           <CardTitle className="text-2xl">BackOffice Login</CardTitle>
           <CardDescription>
             Restricted access. Domain verification required.
           </CardDescription>
         </CardHeader>
         <CardContent>
           <form onSubmit={handleLogin} className="space-y-4">
             <div className="space-y-2">
               <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@salonmagik.com"
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 required
                 autoComplete="email"
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="password">Password</Label>
               <div className="relative">
                 <Input
                   id="password"
                   type={showPassword ? "text" : "password"}
                   placeholder="••••••••"
                   value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   required
                   autoComplete="current-password"
                   className="pr-10"
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
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <div className="text-center">
              <Link
                to="/backoffice/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Only authorized personnel with approved email domains can access this system.
          </p>
        </CardContent>
       </Card>
     </div>
   );
 }