import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Scissors,
  Package,
  ShoppingBag,
  Gift,
  Plus,
  Search,
  Clock,
} from "lucide-react";
import { AddServiceDialog } from "@/components/dialogs/AddServiceDialog";
import { AddPackageDialog } from "@/components/dialogs/AddPackageDialog";
import { AddProductDialog } from "@/components/dialogs/AddProductDialog";
import { AddVoucherDialog } from "@/components/dialogs/AddVoucherDialog";
import { useServices } from "@/hooks/useServices";
import { usePackages } from "@/hooks/usePackages";
import { useProducts } from "@/hooks/useProducts";
import { useVouchers } from "@/hooks/useVouchers";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

type TabValue = "all" | "services" | "packages" | "products" | "vouchers";

export default function ServicesPage() {
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabValue>("all");

  const { currentTenant } = useAuth();
  const { services, isLoading: servicesLoading, refetch: refetchServices } = useServices();
  const { packages, isLoading: packagesLoading, refetch: refetchPackages } = usePackages();
  const { products, isLoading: productsLoading, refetch: refetchProducts } = useProducts();
  const { vouchers, isLoading: vouchersLoading, refetch: refetchVouchers } = useVouchers();

  const currency = currentTenant?.currency || "USD";
  const isLoading = servicesLoading || packagesLoading || productsLoading;

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = {
      NGN: "₦",
      GHS: "₵",
      USD: "$",
      EUR: "€",
      GBP: "£",
    };
    return `${symbols[currency] || ""}${Number(amount).toLocaleString()}`;
  };

  // Build unified items list
  const allItems = [
    ...services.map((s) => ({
      id: s.id,
      type: "service" as const,
      name: s.name,
      description: s.description || "",
      price: Number(s.price),
      duration: s.duration_minutes,
      images: s.image_urls || [],
    })),
    ...packages.map((p) => ({
      id: p.id,
      type: "package" as const,
      name: p.name,
      description: p.description || "",
      price: Number(p.price),
      originalPrice: p.original_price ? Number(p.original_price) : undefined,
      images: p.image_urls || [],
    })),
    ...products.map((p) => ({
      id: p.id,
      type: "product" as const,
      name: p.name,
      description: p.description || "",
      price: Number(p.price),
      stock: p.stock_quantity,
      images: p.image_urls || [],
    })),
  ];

  const filteredItems = allItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
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
      case "vouchers":
        setVoucherDialogOpen(true);
        break;
      default:
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
      case "vouchers":
        return "Add Voucher";
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
              Manage your service catalog, packages, products, and vouchers.
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
          <TabsList className="flex-wrap">
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
            <TabsTrigger value="vouchers" className="flex items-center gap-2">
              <Gift className="w-4 h-4" />
              Vouchers
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {/* Search */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search services, products, packages..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Loading State */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-16 mb-2" />
                      <Skeleton className="h-5 w-32 mb-1" />
                      <Skeleton className="h-4 w-48" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                {/* All Tab */}
                <TabsContent value="all" className="mt-0">
                  {filteredItems.length === 0 ? (
                    <EmptyState message="No items yet. Add services, products, or packages to get started." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredItems.map((item) => (
                        <ItemCard key={item.id} item={item} currency={currency} formatCurrency={formatCurrency} />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Services Tab */}
                <TabsContent value="services" className="mt-0">
                  {services.length === 0 ? (
                    <EmptyState message="No services yet. Add your first service." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {services
                        .filter(
                          (s) =>
                            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (s.description || "").toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((s) => (
                          <ItemCard
                            key={s.id}
                            item={{
                              id: s.id,
                              type: "service",
                              name: s.name,
                              description: s.description || "",
                              price: Number(s.price),
                              duration: s.duration_minutes,
                              images: s.image_urls || [],
                            }}
                            currency={currency}
                            formatCurrency={formatCurrency}
                          />
                        ))}
                    </div>
                  )}
                </TabsContent>

                {/* Packages Tab */}
                <TabsContent value="packages" className="mt-0">
                  {packages.length === 0 ? (
                    <EmptyState message="No packages yet. Bundle services together." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {packages
                        .filter(
                          (p) =>
                            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((p) => (
                          <ItemCard
                            key={p.id}
                            item={{
                              id: p.id,
                              type: "package",
                              name: p.name,
                              description: p.description || "",
                              price: Number(p.price),
                              originalPrice: p.original_price ? Number(p.original_price) : undefined,
                              images: p.image_urls || [],
                            }}
                            currency={currency}
                            formatCurrency={formatCurrency}
                          />
                        ))}
                    </div>
                  )}
                </TabsContent>

                {/* Products Tab */}
                <TabsContent value="products" className="mt-0">
                  {products.length === 0 ? (
                    <EmptyState message="No products yet. Add items to sell." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {products
                        .filter(
                          (p) =>
                            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((p) => (
                          <ItemCard
                            key={p.id}
                            item={{
                              id: p.id,
                              type: "product",
                              name: p.name,
                              description: p.description || "",
                              price: Number(p.price),
                              stock: p.stock_quantity,
                              images: p.image_urls || [],
                            }}
                            currency={currency}
                            formatCurrency={formatCurrency}
                          />
                        ))}
                    </div>
                  )}
                </TabsContent>

                {/* Vouchers Tab */}
                <TabsContent value="vouchers" className="mt-0">
                  {vouchersLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1, 2].map((i) => (
                        <Card key={i}>
                          <CardContent className="p-4">
                            <Skeleton className="h-5 w-24 mb-2" />
                            <Skeleton className="h-4 w-16" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : vouchers.length === 0 ? (
                    <EmptyState message="No vouchers yet. Create gift cards for customers." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {vouchers.map((v) => (
                        <Card key={v.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wider text-purple-600">
                                  GIFT CARD
                                </p>
                                <h3 className="font-mono font-semibold mt-1 text-lg">{v.code}</h3>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge
                                    variant="secondary"
                                    className={
                                      v.status === "active"
                                        ? "bg-success/10 text-success"
                                        : v.status === "redeemed"
                                        ? "bg-muted text-muted-foreground"
                                        : "bg-destructive/10 text-destructive"
                                    }
                                  >
                                    {v.status}
                                  </Badge>
                                  {v.expires_at && (
                                    <span className="text-xs text-muted-foreground">
                                      Expires {format(new Date(v.expires_at), "MMM d, yyyy")}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-lg">{formatCurrency(Number(v.amount))}</p>
                                <p className="text-sm text-muted-foreground">
                                  Balance: {formatCurrency(Number(v.balance))}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>

      {/* Dialogs */}
      <AddServiceDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        onSuccess={refetchServices}
      />
      <AddPackageDialog
        open={packageDialogOpen}
        onOpenChange={setPackageDialogOpen}
        onSuccess={refetchPackages}
      />
      <AddProductDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        onSuccess={refetchProducts}
      />
      <AddVoucherDialog
        open={voucherDialogOpen}
        onOpenChange={setVoucherDialogOpen}
        onSuccess={refetchVouchers}
      />
    </SalonSidebar>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

interface CatalogItem {
  id: string;
  type: "service" | "package" | "product";
  name: string;
  description: string;
  price: number;
  duration?: number;
  originalPrice?: number;
  stock?: number;
  images?: string[];
}

function ItemCard({
  item,
  currency,
  formatCurrency,
}: {
  item: CatalogItem;
  currency: string;
  formatCurrency: (amount: number) => string;
}) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    service: { label: "SERVICE", color: "text-primary" },
    package: { label: "PACKAGE", color: "text-purple-600" },
    product: { label: "PRODUCT", color: "text-emerald-600" },
  };

  const typeInfo = typeLabels[item.type] || typeLabels.service;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Image thumbnail */}
          {item.images && item.images.length > 0 ? (
            <img
              src={item.images[0]}
              alt={item.name}
              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              {item.type === "service" && <Scissors className="w-6 h-6 text-muted-foreground" />}
              {item.type === "package" && <Package className="w-6 h-6 text-muted-foreground" />}
              {item.type === "product" && <ShoppingBag className="w-6 h-6 text-muted-foreground" />}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium uppercase tracking-wider ${typeInfo.color}`}>
              {typeInfo.label}
            </p>
            <h3 className="font-semibold mt-1 truncate">{item.name}</h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {item.description || "No description"}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {item.duration && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {item.duration} mins
                </Badge>
              )}
              {item.stock !== undefined && (
                <Badge variant="outline" className="text-xs">
                  {item.stock} in stock
                </Badge>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0 ml-4">
            <p className="font-semibold text-lg">{formatCurrency(item.price)}</p>
            {item.originalPrice && (
              <p className="text-sm text-muted-foreground line-through">
                {formatCurrency(item.originalPrice)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
