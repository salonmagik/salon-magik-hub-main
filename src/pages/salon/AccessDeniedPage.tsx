import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldX, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccessDeniedPage() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/salon");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-8 h-8 text-destructive" />
        </div>
        
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        
        <p className="text-muted-foreground mb-6">
          You don't have permission to access this page. Contact your salon owner if you believe this is an error.
        </p>
        
        <div className="mb-6">
          <div className="w-12 h-12 border-4 border-muted rounded-full flex items-center justify-center mx-auto">
            <span className="text-xl font-bold">{countdown}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Redirecting to dashboard...
          </p>
        </div>
        
        <Button onClick={() => navigate("/salon")} className="gap-2">
          <Home className="w-4 h-4" />
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
