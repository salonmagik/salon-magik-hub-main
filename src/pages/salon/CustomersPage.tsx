import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Tag,
  UserPlus,
  Calendar,
  Upload,
  Search,
  Mail,
  Phone,
  CreditCard,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddCustomerDialog } from "@/components/dialogs/AddCustomerDialog";

// Status cards data
const statusCards = [
  { label: "Total Customers", count: 2, icon: Users, color: "text-primary", bgColor: "bg-primary/10" },
  { label: "VIP Customers", count: 0, icon: Tag, color: "text-success", bgColor: "bg-success/10" },
  { label: "New This Month", count: 0, icon: UserPlus, color: "text-purple-600", bgColor: "bg-purple-50" },
  { label: "Inactive", count: 0, icon: Calendar, color: "text-muted-foreground", bgColor: "bg-muted" },
];

// Sample customers data
const customers = [
  {
    id: "1",
    firstName: "Jamin",
    lastName: "Customer",
    email: "jaminonuegbu@gmail.com",
    phone: "+234545245532",
    status: "active",
    balance: 0,
    visits: 0,
  },
  {
    id: "2",
    firstName: "Darling",
    lastName: "Customers",
    email: "agate.ambrose@gmail.com",
    phone: "+233256611702",
    status: "active",
    balance: 0,
    visits: 0,
  },
];

const statusFilters = ["All", "Active", "Inactive", "Blocked"];

export default function CustomersPage() {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery);

    const matchesFilter =
      activeFilter === "All" ||
      customer.status.toLowerCase() === activeFilter.toLowerCase();

    return matchesSearch && matchesFilter;
  });

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Customers</h1>
            <p className="text-muted-foreground">
              Manage customer relationships and celebrate key moments.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button onClick={() => setCustomerDialogOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statusCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.label}
                className="cursor-pointer hover:shadow-md transition-shadow border-2 border-transparent hover:border-primary/20"
              >
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

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, email, or tag..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            {statusFilters.map((filter) => (
              <Button
                key={filter}
                variant={activeFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>

        {/* Customers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCustomers.map((customer) => (
            <Card
              key={customer.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center text-lg font-semibold flex-shrink-0">
                    {getInitials(customer.firstName, customer.lastName)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">
                        {customer.firstName} {customer.lastName}
                      </h3>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "capitalize text-xs",
                          customer.status === "active"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {customer.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{customer.phone}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          ₵{customer.balance}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {customer.visits} visits
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* More Button */}
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredCustomers.length} of {customers.length} customers
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="default" size="sm">
              1
            </Button>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
      />
    </SalonSidebar>
  );
}
