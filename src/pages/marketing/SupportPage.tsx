import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Mail, MessageCircle, Clock, BookOpen } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/">
            <SalonMagikLogo size="md" />
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/pricing">
              <Button variant="ghost" size="sm">
                Pricing
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <h1 className="text-4xl font-semibold mb-4">Support</h1>
          <p className="text-lg text-muted-foreground mb-8">
            We're here to help you get the most out of Salon Magik.
          </p>

          <div className="grid gap-6 md:grid-cols-2 mb-12">
            <Card className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Email Support</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Send us an email and we'll get back to you within 24 hours.
              </p>
              <a href="mailto:support@salonmagik.com">
                <Button variant="outline" className="w-full">
                  support@salonmagik.com
                </Button>
              </a>
            </Card>

            <Card className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">WhatsApp</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Quick questions? Chat with us on WhatsApp during business hours.
              </p>
              <Button variant="outline" className="w-full" disabled>
                Coming soon
              </Button>
            </Card>
          </div>

          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Clock className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-medium">Response Times</h2>
              </div>
              <div className="bg-surface rounded-lg p-4 space-y-2 text-sm">
                <p>
                  <span className="font-medium">Email:</span> Within 24 hours (business days)
                </p>
                <p>
                  <span className="font-medium">WhatsApp:</span> Within 2 hours (9am-6pm WAT, Mon-Fri)
                </p>
                <p>
                  <span className="font-medium">Urgent issues:</span> We prioritize billing and access problems
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <BookOpen className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-medium">Before You Contact Us</h2>
              </div>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 text-sm">
                <li>Check if your issue is covered in our FAQ on the pricing page</li>
                <li>Make sure you're using the latest version of your browser</li>
                <li>Try logging out and back in if you're experiencing odd behavior</li>
                <li>Include your salon name and email when contacting support</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <SalonMagikLogo size="sm" />
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Salon Magik</p>
        </div>
      </footer>
    </div>
  );
}
