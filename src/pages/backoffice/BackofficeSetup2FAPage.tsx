 import { useState, useEffect } from "react";
 import { useNavigate } from "react-router-dom";
 import { useBackofficeAuth } from "@/hooks/backoffice";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
 import { useToast } from "@/hooks/use-toast";
 import { Loader2, Shield, Smartphone, Copy, Check } from "lucide-react";
 
 // Generate a random base32 secret
 function generateSecret(): string {
   const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
   let secret = "";
   const array = new Uint8Array(20);
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
       navigate("/backoffice/login", { replace: true });
     } else if (!requiresTotpSetup) {
       navigate("/backoffice", { replace: true });
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
           description: "Your account is now secured with two-factor authentication.",
         });
         navigate("/backoffice", { replace: true });
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
     navigate("/backoffice/login", { replace: true });
   };
 
   return (
     <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
       <Card className="w-full max-w-md">
         <CardHeader className="text-center">
           <div className="mx-auto mb-4 rounded-full bg-primary/10 p-3 w-fit">
             <Smartphone className="h-8 w-8 text-primary" />
           </div>
           <CardTitle className="text-2xl">Set Up Two-Factor Authentication</CardTitle>
           <CardDescription>
             2FA is required for BackOffice access. Use an authenticator app like Google Authenticator or Authy.
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-6">
           {/* Step 1: Add to authenticator */}
           <div className="space-y-3">
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                 1
               </div>
               <span className="font-medium">Add to your authenticator app</span>
             </div>
             
             {/* QR Code placeholder - in production, generate actual QR */}
             <div className="p-4 bg-muted rounded-lg text-center">
               <p className="text-sm text-muted-foreground mb-2">
                 Scan the QR code or enter this key manually:
               </p>
               <div className="flex items-center justify-center gap-2">
                 <code className="bg-background px-3 py-2 rounded text-sm font-mono break-all">
                   {secret.match(/.{1,4}/g)?.join(" ")}
                 </code>
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   onClick={handleCopySecret}
                   className="shrink-0"
                 >
                   {copied ? (
                     <Check className="h-4 w-4 text-success" />
                   ) : (
                     <Copy className="h-4 w-4" />
                   )}
                 </Button>
               </div>
             </div>
           </div>
 
           {/* Step 2: Enter code */}
           <div className="space-y-3">
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                 2
               </div>
               <span className="font-medium">Enter the 6-digit code</span>
             </div>
             
             <div className="flex justify-center">
               <InputOTP
                 maxLength={6}
                 value={code}
                 onChange={setCode}
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
           </div>
 
           <Button 
             onClick={handleVerifyAndSetup} 
             className="w-full" 
             disabled={isLoading || code.length !== 6}
           >
             {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             Enable 2FA
           </Button>
 
           <div className="flex items-center justify-center">
             <Button variant="link" onClick={handleSignOut} className="text-muted-foreground">
               Cancel and sign out
             </Button>
           </div>
 
           <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
             <Shield className="h-3 w-3" />
             <span>Save your secret key securely - you'll need it if you lose access</span>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }