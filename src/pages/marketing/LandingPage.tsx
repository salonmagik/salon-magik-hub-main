import { Link } from "react-router-dom";
import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Calendar,
  CreditCard,
  Users,
  Wallet,
  BookOpen,
  Clock,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

export default function LandingPage() {
  const { isWaitlistMode, isLoading } = useWaitlistMode();

  const features = [
    {
      icon: Calendar,
      title: "Smart Scheduling",
      description: "Let clients book 24/7. Automatic reminders reduce no-shows by up to 70%.",
    },
    {
      icon: CreditCard,
      title: "Secure Deposits",
      description: "Collect deposits upfront. Protect your time with flexible cancellation policies.",
    },
    {
      icon: Wallet,
      title: "Customer Purse",
      description: "Store credit system that keeps clients coming back. Refunds made simple.",
    },
    {
      icon: BookOpen,
      title: "Offline Journal",
      description: "Track cash and card payments even when offline. Sync when you're ready.",
    },
    {
      icon: Users,
      title: "Team Management",
      description: "Invite staff with role-based permissions. Everyone stays in their lane.",
    },
    {
      icon: Clock,
      title: "Real-time Calendar",
      description: "See your day at a glance. Manage walk-ins and scheduled appointments together.",
    },
  ];

  const benefits = [
    "14-day free trial, no card required",
    "Works on any device",
    "African payment methods included",
    "WhatsApp notifications coming soon",
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <SalonMagikLogo size="md" />
          <div className="flex items-center gap-4">
            <Link to="/pricing">
              <Button variant="ghost" size="sm">
                Pricing
              </Button>
            </Link>
            {!isLoading && !isWaitlistMode && (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h1 className="text-4xl md:text-5xl font-semibold leading-tight">
                Bookings, payments, and customers.{" "}
                <span className="text-primary">In one calm place.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg">
                Salon Magik helps beauty professionals manage appointments, collect payments, 
                and grow their business — without the chaos.
              </p>
              
              <div className="flex flex-wrap gap-3 pt-2">
                {benefits.map((benefit) => (
                  <div key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>

              {!isLoading && !isWaitlistMode && (
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Link to="/signup">
                    <Button size="lg" className="w-full sm:w-auto">
                      Get started free
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </Link>
                  <Link to="/pricing">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto">
                      View pricing
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Waitlist Form or CTA Card */}
            <div className="lg:pl-8">
              {isWaitlistMode ? (
                <WaitlistForm />
              ) : (
                <Card className="p-8 bg-surface border-2">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                      <Calendar className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-medium">Start your free trial</h3>
                    <p className="text-muted-foreground">
                      Set up your salon in minutes. No credit card required.
                    </p>
                    <Link to="/signup">
                      <Button size="lg" className="w-full">
                        Create your account
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-surface px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold mb-4">Everything you need to run your salon</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built by people who understand the beauty industry. No complicated setup, 
              no hidden fees, just tools that work.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="p-6 hover-lift">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-medium mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-semibold mb-4">
            {isWaitlistMode ? "Join the waitlist" : "Ready to get started?"}
          </h2>
          <p className="text-muted-foreground mb-8">
            {isWaitlistMode
              ? "We're currently in private beta. Join the waitlist to get early access."
              : "Start your 14-day free trial today. No credit card required."}
          </p>
          
          {isWaitlistMode ? (
            <div className="max-w-md mx-auto">
              <WaitlistForm compact />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/signup">
                <Button size="lg">
                  Get started free
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link to="/pricing">
                <Button variant="outline" size="lg">
                  See pricing
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <SalonMagikLogo size="sm" />
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link to="/support" className="hover:text-foreground transition-colors">
              Support
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Salon Magik
          </p>
        </div>
      </footer>
    </div>
  );
}
