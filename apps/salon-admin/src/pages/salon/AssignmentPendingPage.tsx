import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export default function AssignmentPendingPage() {
  const { user, currentTenant, signOut } = useAuth();

  useEffect(() => {
    if (!user?.id || !currentTenant?.id) return;
    (async () => {
      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "assignment.pending_shown",
        _entity_type: "user",
        _entity_id: user.id,
        _metadata: {
          route: "/salon/assignment-pending",
        },
      });
    })();
  }, [currentTenant?.id, user?.id]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-lg w-full border rounded-xl p-8 text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded-full bg-warning-bg flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-warning-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Salon assignment required</h1>
          <p className="text-muted-foreground">
            Your account is active, but you have not been assigned to any salon yet.
            Please reach out to your salon owner or manager for assignment.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/salon/help">
            <Button variant="outline" className="w-full sm:w-auto">
              Get help
            </Button>
          </Link>
          <Button onClick={() => void signOut()} className="gap-2 w-full sm:w-auto">
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
