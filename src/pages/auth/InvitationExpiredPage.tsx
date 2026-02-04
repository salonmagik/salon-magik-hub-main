import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, ArrowRight } from "lucide-react";

export default function InvitationExpiredPage() {
  return (
    <div className="min-h-screen auth-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="flex justify-center mb-6">
          <SalonMagikLogo size="lg" />
        </div>

        <div className="w-16 h-16 bg-warning-bg rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-warning" />
        </div>

        <h1 className="text-2xl font-semibold mb-2">Invitation Expired</h1>
        <p className="text-muted-foreground mb-6">
          This invitation link has expired or is no longer valid. Invitation links are valid for 7 days.
        </p>

        <div className="space-y-3">
          <Link to="/">
            <Button className="w-full">
              Join the waitlist
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" className="w-full">
              Already have an account? Log in
            </Button>
          </Link>
        </div>

        <p className="text-sm text-muted-foreground mt-6">
          Think this is a mistake?{" "}
          <a href="mailto:support@salonmagik.com" className="text-primary hover:underline">
            Contact support
          </a>
        </p>
      </Card>
    </div>
  );
}
