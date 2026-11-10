 import { useState, useEffect } from "react";
 import { useNavigate } from "react-router-dom";
import { useBackofficeAuth } from "@/hooks";
 import { Button } from "@ui/button";
 import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
 import { useToast } from "@ui/ui/use-toast";
 import { Loader2, Shield, Copy, Check } from "lucide-react";
 import { cn } from "@shared/utils";

// Generate a random base32 secret - exactly 16 characters for Google Authenticator compatibility
function generateSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (const byte of array) {
    secret += chars[byte % 32];
  }
  return secret;
}

 export default function BackofficeSetup2FAPage() {
   const navigate = useNavigate();
   const { toast } = useToast();
   const { setupTotp, signOut, profile, user, isAuthenticated, requiresTotpSetup } = useBackofficeAuth();
   const [secret, setSecret] = useState("");
   const [code, setCode] = useState("");
   const [isLoading, setIsLoading] = useState(false);
   const [copied, setCopied] = useState(false);

   // Redirect if not authenticated or doesn't need 2FA setup
   useEffect(() => {
     if (!isAuthenticated) {
       navigate("/login", { replace: true });
     } else if (!requiresTotpSetup) {
       navigate("/", { replace: true });
     }
   }, [isAuthenticated, requiresTotpSetup, navigate]);

   // Generate secret on mount
   useEffect(() => {
     if (!secret) {
       setSecret(generateSecret());
     }
   }, [secret]);

   const otpauthUrl = `otpauth://totp/SalonMagik:${user?.email}?secret=${secret}&issuer=SalonMagik&algorithm=SHA1&digits=6&period=30`;

   const handleCopySecret = async () => {
     await navigator.clipboard.writeText(secret);
     setCopied(true);
     setTimeout(() => setCopied(false), 2000);
   };

   const handleVerifyAndSetup = async () => {
     if (code.length !== 6) return;

     setIsLoading(true);
     try {
       const success = await setupTotp(secret);

      if (success) {
				toast({
					title: "2FA enabled",
					description:
						"Your account is now secured with two-factor authentication.",
				});
				navigate("/", { replace: true });
			} else {
				toast({
					title: "Setup failed",
					description: "Could not verify the code. Please try again.",
					variant: "destructive",
				});
				setCode("");
			}
     } finally {
       setIsLoading(false);
     }
   };

   const handleSignOut = async () => {
     await signOut();
     navigate("/login", { replace: true });
   };

   return (
     <div className="flex min-h-screen items-center justify-center bg-background p-6">
       <div className="w-full max-w-[420px]">
         <div className="mb-6 flex flex-col items-center">
           <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary">
             <Shield className="h-5 w-5 text-primary-foreground" />
           </div>
           <div className="text-lg font-bold text-foreground">Set up two-factor authentication</div>
           <div className="mt-0.5 text-center text-[12.5px] text-muted-foreground">
             Required before you can access anything in the backoffice
           </div>
         </div>

         <div className="rounded-2xl border border-border bg-card p-6">
           <div className="mb-5 flex items-start gap-4">
             <img
               src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`}
               alt="Scan with authenticator app"
               className="h-[110px] w-[110px] shrink-0 rounded-xl bg-white p-2"
             />
             <div className="pt-1 text-[12.5px] text-muted-foreground">
               <p className="mb-2">Scan with Google Authenticator, 1Password, or any TOTP app.</p>
               <p className="flex flex-wrap items-center gap-1.5">
                 Can't scan?
                 <code className="font-mono font-semibold text-foreground">
                   {secret.match(/.{1,4}/g)?.join(" ")}
                 </code>
                 <Button variant="ghost" size="icon" onClick={handleCopySecret} className="h-6 w-6 shrink-0">
                   {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                 </Button>
               </p>
             </div>
           </div>

           <div className="mb-4">
             <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
               Enter the 6-digit code to confirm
             </label>
             <InputOTP maxLength={6} value={code} onChange={setCode} disabled={isLoading}>
               <InputOTPGroup className="w-full justify-between gap-2">
                 {[0, 1, 2, 3, 4, 5].map((i) => (
                   <InputOTPSlot
                     key={i}
                     index={i}
                     className={cn(
                       "h-12 w-full rounded-[8px] border-l text-lg font-bold",
                       code.length > i && "border-primary bg-primary/10",
                     )}
                   />
                 ))}
               </InputOTPGroup>
             </InputOTP>
           </div>

           <Button
             onClick={handleVerifyAndSetup}
             disabled={isLoading || code.length !== 6}
             className="w-full rounded-full py-[11px] text-[13.5px] font-semibold"
           >
             {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             Confirm &amp; enable 2FA
           </Button>

           <div className="mt-4 flex items-center justify-center">
             <Button variant="link" onClick={handleSignOut} className="h-auto p-0 text-xs text-muted-foreground">
               Cancel and sign out
             </Button>
           </div>
         </div>

         <p className="mt-4 text-center text-[11.5px] text-muted-foreground/70">
           Save your secret key securely — you'll need it if you lose access to your authenticator.
         </p>
       </div>
     </div>
   );
 }
