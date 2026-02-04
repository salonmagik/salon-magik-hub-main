import {
  Calendar,
  CreditCard,
  Users,
  Wallet,
  BookOpen,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";

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

export function FeaturesSection() {
  return (
    <section className="py-16 md:py-24 bg-surface px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Everything you need to run your business
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Built by people who understand the beauty industry. No complicated setup, 
            no hidden fees, just tools that work.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6 hover-lift border-0 shadow-card">
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
  );
}
