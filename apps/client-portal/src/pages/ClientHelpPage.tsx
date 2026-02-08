import { ClientSidebar } from "@/components/ClientSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { HelpCircle, Mail, MessageCircle } from "lucide-react";

export default function ClientHelpPage() {
  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Help & Support</h1>
          <p className="text-muted-foreground mt-1">
            Get help with your account and bookings
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                FAQs
              </CardTitle>
              <CardDescription>
                Find answers to common questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                View FAQs
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Support
              </CardTitle>
              <CardDescription>
                Get in touch with our support team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                <MessageCircle className="mr-2 h-4 w-4" />
                Send Message
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contact Your Salon</CardTitle>
            <CardDescription>
              For booking-specific questions, contact the salon directly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              You can find contact information for each salon in your booking details.
            </p>
          </CardContent>
        </Card>
      </div>
    </ClientSidebar>
  );
}
