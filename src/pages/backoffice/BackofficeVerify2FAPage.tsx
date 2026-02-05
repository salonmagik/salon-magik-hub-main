 import { useState } from "react";
 import { useNavigate } from "react-router-dom";
 import { useBackofficeAuth } from "@/hooks/backoffice";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
 import { useToast } from "@/hooks/use-toast";
 import { Loader2, Shield, KeyRound } from "lucide-react";
 
 export default function BackofficeVerify2FAPage() {
   const navigate = useNavigate();
   const { toast } = useToast();
   const { verifyTotp, signOut, profile } = useBackofficeAuth();
   const [code, setCode] = useState("");
   const [isLoading, setIsLoading] = useState(false);
 
   const handleVerify = async () => {
     if (code.length !== 6) return;
     
     setIsLoading(true);
     try {
       const success = await verifyTotp(code);
       
       if (success) {
         navigate("/backoffice", { replace: true });
       } else {
         toast({
           title: "Invalid code",
           description: "Please check your authenticator app and try again.",
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
             <KeyRound className="h-8 w-8 text-primary" />
           </div>
           <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
           <CardDescription>
             {profile?.full_name ? `Welcome back, ${profile.full_name.split(" ")[0]}. ` : ""}
             Enter the code from your authenticator app.
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-6">
           <div className="flex justify-center">
             <InputOTP
               maxLength={6}
               value={code}
               onChange={setCode}
               onComplete={handleVerify}
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
 
           <Button 
             onClick={handleVerify} 
             className="w-full" 
             disabled={isLoading || code.length !== 6}
           >
             {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             Verify
           </Button>
 
           <div className="flex items-center justify-center">
             <Button variant="link" onClick={handleSignOut} className="text-muted-foreground">
               Use a different account
             </Button>
           </div>
 
           <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
             <Shield className="h-3 w-3" />
             <span>Protected by 2FA</span>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }