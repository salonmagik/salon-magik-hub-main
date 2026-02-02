import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Play,
  Pause,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const statusCards = [
  { label: "All Appointments", count: 12, active: true },
  { label: "Deposit-only", count: 3 },
  { label: "Fully Paid", count: 5 },
  { label: "Pay-at-Salon", count: 2 },
  { label: "Refund Requests", count: 1 },
  { label: "Cancelled", count: 1 },
];

const appointments = [
  {
    id: "APT-001",
    startTime: "09:00 AM",
    endTime: "10:30 AM",
    customer: { name: "Sarah Johnson", isNew: false },
    phone: "•••• 1234",
    services: ["Hair Cut & Style"],
    package: null,
    payment: "Fully Paid",
    purseUsed: false,
    status: "Scheduled",
  },
  {
    id: "APT-002",
    startTime: "10:30 AM",
    endTime: "11:00 AM",
    customer: { name: "Mike Chen", isNew: true },
    phone: "•••• 5678",
    services: ["Beard Trim"],
    package: null,
    payment: "Deposit",
    purseUsed: true,
    status: "Scheduled",
  },
  {
    id: "APT-003",
    startTime: "11:00 AM",
    endTime: "02:00 PM",
    customer: { name: "Emily Davis", isNew: false },
    phone: "•••• 9012",
    services: ["Color Treatment", "Hair Cut"],
    package: "Premium Package",
    payment: "Pay-at-Salon",
    purseUsed: false,
    status: "Started",
  },
  {
    id: "APT-004",
    startTime: "02:00 PM",
    endTime: "03:30 PM",
    customer: { name: "Alex Turner", isNew: false },
    phone: "•••• 3456",
    services: ["Full Service"],
    package: null,
    payment: "Fully Paid",
    purseUsed: false,
    status: "Completed",
  },
];

const paymentBadgeStyles: Record<string, string> = {
  "Fully Paid": "bg-success/10 text-success",
  "Deposit": "bg-primary/10 text-primary",
  "Pay-at-Salon": "bg-warning-bg text-warning-foreground",
};

const statusBadgeStyles: Record<string, string> = {
  Scheduled: "bg-muted text-muted-foreground",
  Started: "bg-primary/10 text-primary",
  Paused: "bg-warning-bg text-warning-foreground",
  Completed: "bg-success/10 text-success",
  Cancelled: "bg-destructive/10 text-destructive",
};

const getStatusActions = (status: string) => {
  switch (status) {
    case "Scheduled":
      return [
        { icon: Play, label: "Start", variant: "default" as const },
        { icon: RefreshCw, label: "Reschedule", variant: "outline" as const },
        { icon: X, label: "Cancel", variant: "outline" as const },
      ];
    case "Started":
      return [
        { icon: Pause, label: "Pause", variant: "outline" as const },
        { icon: Check, label: "End", variant: "default" as const },
      ];
    case "Paused":
      return [
        { icon: Play, label: "Resume", variant: "default" as const },
        { icon: Check, label: "End", variant: "outline" as const },
      ];
    default:
      return [];
  }
};

export default function AppointmentsPage() {
  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Appointments</h1>
            <p className="text-muted-foreground">Manage your salon appointments</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Appointment
          </Button>
        </div>

        {/* Status Cards */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {statusCards.map((card) => (
            <Card
              key={card.label}
              className={`flex-shrink-0 cursor-pointer transition-colors ${
                card.active ? "border-primary bg-primary/5" : "hover:border-primary/50"
              }`}
            >
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground whitespace-nowrap">{card.label}</p>
                <p className="text-2xl font-semibold">{card.count}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="scheduled" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList>
              <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
              <TabsTrigger value="unscheduled">Unscheduled</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search appointments..." className="pl-9 w-64" />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Calendar className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="scheduled" className="space-y-4">
            {/* Date Filter Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {["Today", "Last 7 days", "Last 30 days", "Last 180 days", "All time"].map((filter, i) => (
                <Button
                  key={filter}
                  variant={i === 0 ? "default" : "outline"}
                  size="sm"
                  className="flex-shrink-0"
                >
                  {filter}
                </Button>
              ))}
            </div>

            {/* Appointments Table */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Start
                      </div>
                    </TableHead>
                    <TableHead className="w-24">End</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead>Service(s)</TableHead>
                    <TableHead className="hidden lg:table-cell">Package</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="hidden lg:table-cell">Purse</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((apt) => {
                    const actions = getStatusActions(apt.status);
                    return (
                      <TableRow key={apt.id} className="table-row-hover">
                        <TableCell className="font-medium text-primary">{apt.startTime}</TableCell>
                        <TableCell className="text-muted-foreground">{apt.endTime}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{apt.customer.name}</span>
                            {apt.customer.isNew && (
                              <Badge variant="secondary" className="text-xs">New</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {apt.phone}
                        </TableCell>
                        <TableCell>
                          {apt.services[0]}
                          {apt.services.length > 1 && (
                            <span className="text-muted-foreground text-sm ml-1">
                              +{apt.services.length - 1} more
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {apt.package || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={paymentBadgeStyles[apt.payment]} variant="secondary">
                            {apt.payment}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {apt.purseUsed ? (
                            <Badge variant="outline">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusBadgeStyles[apt.status]} variant="secondary">
                            {apt.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {actions.map((action) => {
                              const Icon = action.icon;
                              return (
                                <Button
                                  key={action.label}
                                  variant={action.variant}
                                  size="sm"
                                  className="h-8"
                                >
                                  <Icon className="w-3 h-3 mr-1" />
                                  {action.label}
                                </Button>
                              );
                            })}
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="unscheduled">
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No unscheduled appointments</p>
                <p className="text-sm">Prepaid services and gifted items will appear here</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SalonSidebar>
  );
}
