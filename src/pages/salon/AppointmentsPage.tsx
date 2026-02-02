import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Clock,
  Search,
  Plus,
  Play,
  Pause,
  Check,
  X,
  RefreshCw,
  MoreHorizontal,
  Users,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScheduleAppointmentDialog } from "@/components/dialogs/ScheduleAppointmentDialog";

// Status cards data
const statusCards = [
  { label: "Total today", count: 1, icon: Calendar, color: "text-primary", bgColor: "bg-primary/10" },
  { label: "Confirmed", count: 1, icon: Check, color: "text-success", bgColor: "bg-success/10" },
  { label: "Completed", count: 0, icon: Clock, color: "text-muted-foreground", bgColor: "bg-muted" },
  { label: "Cancelled / No show", count: 0, icon: AlertCircle, color: "text-destructive", bgColor: "bg-destructive/10" },
];

// Sample appointments data
const appointments = [
  {
    id: "APT-001",
    date: "2026-02-02",
    startTime: "17:00",
    endTime: "18:00",
    customer: { name: "Darling Customers", phone: "+233256611702", isNew: false },
    service: "Full body waxing",
    staff: "Agatha Ambrose",
    status: "confirmed",
    payment: "deposit_paid",
    notes: null,
  },
];

const statusBadgeStyles: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "bg-muted", text: "text-muted-foreground" },
  confirmed: { bg: "bg-success/10", text: "text-success" },
  started: { bg: "bg-primary/10", text: "text-primary" },
  paused: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  completed: { bg: "bg-success/10", text: "text-success" },
  cancelled: { bg: "bg-destructive/10", text: "text-destructive" },
};

const paymentLabels: Record<string, string> = {
  unpaid: "Unpaid",
  deposit_paid: "Deposit Paid",
  fully_paid: "Fully Paid",
  pay_at_salon: "Pay at Salon",
};

export default function AppointmentsPage() {
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Appointments</h1>
            <p className="text-muted-foreground">
              Manage upcoming bookings and stay on top of today's schedule.
            </p>
          </div>
          <Button onClick={() => setAppointmentDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New appointment
          </Button>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statusCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-semibold mt-1">{card.count}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-4">
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-auto"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Appointments Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No appointments found</p>
                    <p className="text-sm text-muted-foreground">
                      Create a new appointment to get started
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                appointments.map((apt) => (
                  <TableRow key={apt.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {apt.startTime} — {apt.endTime}
                        </p>
                        <p className="text-xs text-muted-foreground">{apt.date}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{apt.customer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.customer.phone}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{apt.service}</TableCell>
                    <TableCell>{apt.staff}</TableCell>
                    <TableCell>
                      <Badge
                        className={`${statusBadgeStyles[apt.status].bg} ${statusBadgeStyles[apt.status].text} capitalize`}
                      >
                        {apt.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {apt.notes ? (
                        <span className="text-sm">{apt.notes}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Select defaultValue={apt.status}>
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="started">Started</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Tabs for Scheduled / Unscheduled */}
        <Tabs defaultValue="scheduled">
          <TabsList>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="unscheduled">Unscheduled</TabsTrigger>
          </TabsList>
          <TabsContent value="unscheduled" className="mt-4">
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No unscheduled appointments</p>
                <p className="text-sm">
                  Prepaid services and gifted items will appear here
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Schedule Appointment Dialog */}
      <ScheduleAppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
      />
    </SalonSidebar>
  );
}
