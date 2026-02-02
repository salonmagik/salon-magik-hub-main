import { useState, useEffect, useCallback, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock, AlertTriangle } from "lucide-react";

interface InactivityGuardProps {
  children: ReactNode;
  warningMinutes?: number;
  logoutMinutes?: number;
}

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

export function InactivityGuard({
  children,
  warningMinutes = 55,
  logoutMinutes = 60,
}: InactivityGuardProps) {
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const warningMs = warningMinutes * 60 * 1000;
  const logoutMs = logoutMinutes * 60 * 1000;

  const resetTimer = useCallback(() => {
    setLastActivity(Date.now());
    setShowWarning(false);
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }, [navigate]);

  // Handle user activity
  useEffect(() => {
    const handleActivity = () => {
      if (!showWarning && !showLogout) {
        setLastActivity(Date.now());
      }
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [showWarning, showLogout]);

  // Check for inactivity
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const inactive = now - lastActivity;

      if (inactive >= logoutMs) {
        setShowWarning(false);
        setShowLogout(true);
        setCountdown(60);
      } else if (inactive >= warningMs && !showWarning) {
        setShowWarning(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastActivity, warningMs, logoutMs, showWarning]);

  // Countdown timer when logout modal is shown
  useEffect(() => {
    if (!showLogout) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showLogout, handleLogout]);

  const handleStayLoggedIn = () => {
    resetTimer();
    setShowWarning(false);
  };

  return (
    <>
      {children}

      {/* Warning Modal - 55 minutes */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-center">
              Session Expiring Soon
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              You've been inactive for a while. For your security, you'll be
              logged out in 5 minutes unless you continue using the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction onClick={handleStayLoggedIn}>
              Stay Logged In
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logout Modal - 60 minutes with countdown */}
      <AlertDialog open={showLogout} onOpenChange={() => {}}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center">
              Logging Out
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-4">
              <p>
                For your security, you're being logged out due to inactivity.
              </p>
              <div className="flex flex-col items-center gap-2">
                <div className="text-4xl font-bold text-foreground tabular-nums">
                  {countdown}
                </div>
                <span className="text-sm text-muted-foreground">
                  seconds remaining
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction
              onClick={() => {
                setShowLogout(false);
                resetTimer();
              }}
            >
              Cancel Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
