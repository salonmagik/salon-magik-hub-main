import { SalonSidebar } from "@/components/layout/SalonSidebar";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <SalonSidebar>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center justify-center h-[60vh] bg-surface rounded-lg border border-dashed border-border">
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium mb-2">{title} Module</p>
            <p className="text-sm">This module is under development</p>
          </div>
        </div>
      </div>
    </SalonSidebar>
  );
}

export function CustomersPage() {
  return <PlaceholderPage title="Customers" description="Manage your salon customers and their history" />;
}

export function ServicesPage() {
  return <PlaceholderPage title="Products & Services" description="Manage your services, products, and packages" />;
}

export function PaymentsPage() {
  return <PlaceholderPage title="Payments" description="View and manage payments, refunds, and wallet" />;
}

export function ReportsPage() {
  return <PlaceholderPage title="Reports" description="View insights and analytics for your salon" />;
}

export function MessagingPage() {
  return <PlaceholderPage title="Messaging" description="Manage communication credits and notifications" />;
}

export function JournalPage() {
  return <PlaceholderPage title="Journal" description="View audit logs and activity history" />;
}

export function StaffPage() {
  return <PlaceholderPage title="Staff" description="Manage staff members and their permissions" />;
}

export function SettingsPage() {
  return <PlaceholderPage title="Settings" description="Configure your salon settings" />;
}

export function HelpPage() {
  return <PlaceholderPage title="Help" description="Get help and support" />;
}
