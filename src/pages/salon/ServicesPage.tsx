import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Scissors,
  Package,
  ShoppingBag,
  Plus,
  Search,
  Clock,
  MoreHorizontal,
} from "lucide-react";
import { AddServiceDialog } from "@/components/dialogs/AddServiceDialog";
import { AddPackageDialog } from "@/components/dialogs/AddPackageDialog";
import { AddProductDialog } from "@/components/dialogs/AddProductDialog";

// Sample data
const services = [
  {
    id: "1",
    type: "service",
    name: "Full Color",
    description: "Single-process color with blowout.",
    price: 12000,
    currency: "NGN",
    duration: 90,
    locations: ["lekki"],
    category: "Color",
  },
  {
    id: "2",
    type: "service",
    name: "Signature Cut",
    description: "Precision cut with consultation.",
    price: 4000,
    currency: "NGN",
    duration: 45,
    locations: ["ikeja", "lekki"],
    category: "Hair",
  },
];

const packages = [
  {
    id: "3",
    type: "package",
    name: "Bridal Prep Package",
    description: "Trial + day-of styling + lashes.",
    price: 55000,
    originalPrice: 65000,
    currency: "NGN",
    locations: ["ikeja"],
  },
];

const products = [
  {
    id: "4",
    type: "product",
    name: "Hydrate Shampoo",
    description: "Sulfate-free hydration shampoo.",
    price: 3000,
    currency: "NGN",
    locations: ["ikeja", "lekki"],
    fulfillment: "Pickup or delivery",
  },
];

const formatCurrency = (amount: number, currency: string) => {
  const symbols: Record<string, string> = {
    NGN: "₦",
    GHS: "₵",
    USD: "$",
  };
  return `${symbols[currency] || ""}${amount.toLocaleString()}`;
};

type TabValue = "all" | "services" | "packages" | "products";

export default function ServicesPage() {
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<TabValue>("all");

  const allItems = [...services, ...packages, ...products];

  const filteredItems = allItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesLocation =
      locationFilter === "all" || item.locations.includes(locationFilter);

    return matchesSearch && matchesLocation;
  });

  const handleAddClick = () => {
    switch (activeTab) {
      case "services":
        setServiceDialogOpen(true);
        break;
      case "packages":
        setPackageDialogOpen(true);
        break;
      case "products":
        setProductDialogOpen(true);
        break;
      default:
        // "all" tab - don't open any dialog
        break;
    }
  };

  const getAddButtonLabel = () => {
    switch (activeTab) {
      case "services":
        return "Add Service";
      case "packages":
        return "Add Package";
      case "products":
        return "Add Product";
      default:
        return null;
    }
  };

  const addButtonLabel = getAddButtonLabel();

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Products & Services</h1>
            <p className="text-muted-foreground">
              Manage your service catalog, packages, and products.
            </p>
          </div>
          {addButtonLabel && (
            <Button onClick={handleAddClick}>
              <Plus className="w-4 h-4 mr-2" />
              {addButtonLabel}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="services" className="flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              Services
            </TabsTrigger>
            <TabsTrigger value="packages" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Packages
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Products
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search services, products, packages"
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  <SelectItem value="ikeja">Ikeja</SelectItem>
                  <SelectItem value="lekki">Lekki</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="name-asc">
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Name A-Z</SelectItem>
                  <SelectItem value="name-desc">Name Z-A</SelectItem>
                  <SelectItem value="price-asc">Price low-high</SelectItem>
                  <SelectItem value="price-desc">Price high-low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Items Grid */}
            <TabsContent value="all" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="services" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services
                  .filter(
                    (s) =>
                      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      s.description.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="packages" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {packages.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="products" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Dialogs */}
      <AddServiceDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
      />
      <AddPackageDialog
        open={packageDialogOpen}
        onOpenChange={setPackageDialogOpen}
      />
      <AddProductDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
      />
    </SalonSidebar>
  );
}

function ItemCard({ item }: { item: any }) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    service: { label: "SERVICE", color: "text-primary" },
    package: { label: "PACKAGE", color: "text-purple-600" },
    product: { label: "PRODUCT", color: "text-emerald-600" },
  };

  const typeInfo = typeLabels[item.type] || typeLabels.service;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className={`text-xs font-medium uppercase tracking-wider ${typeInfo.color}`}>
              {typeInfo.label}
            </p>
            <h3 className="font-semibold mt-1">{item.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {item.description}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {item.locations?.map((loc: string) => (
                <Badge key={loc} variant="secondary" className="text-xs capitalize">
                  {loc}
                </Badge>
              ))}
              {item.duration && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {item.duration} mins
                </Badge>
              )}
              {item.fulfillment && (
                <Badge variant="outline" className="text-xs">
                  {item.fulfillment}
                </Badge>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0 ml-4">
            <p className="font-semibold text-lg">
              {formatCurrency(item.price, item.currency)}
            </p>
            {item.originalPrice && (
              <p className="text-sm text-muted-foreground line-through">
                {formatCurrency(item.originalPrice, item.currency)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end mt-4 pt-4 border-t">
          <Button variant="outline" size="sm">
            <ShoppingBag className="w-4 h-4 mr-2" />
            Add to cart
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
