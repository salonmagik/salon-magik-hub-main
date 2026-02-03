import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ItemCard } from "./ItemCard";
import type { PublicService, PublicPackage, PublicProduct, PublicCategory } from "@/hooks/booking";

interface CatalogViewProps {
  services: PublicService[];
  packages: PublicPackage[];
  products: PublicProduct[];
  categories: PublicCategory[];
  currency: string;
}

export function CatalogView({
  services,
  packages,
  products,
  categories,
  currency,
}: CatalogViewProps) {
  const [activeTab, setActiveTab] = useState("services");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Filter services by category
  const filteredServices = activeCategory
    ? services.filter((s) => s.category_id === activeCategory)
    : services;

  const hasPackages = packages.length > 0;
  const hasProducts = products.length > 0;

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="services">Services</TabsTrigger>
          {hasPackages && <TabsTrigger value="packages">Packages</TabsTrigger>}
          {hasProducts && <TabsTrigger value="products">Products</TabsTrigger>}
        </TabsList>

        <TabsContent value="services" className="mt-6">
          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-4">
              <button
                onClick={() => setActiveCategory(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Services Grid */}
          {filteredServices.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredServices.map((service) => (
                <ItemCard
                  key={service.id}
                  type="service"
                  id={service.id}
                  name={service.name}
                  description={service.description}
                  price={Number(service.price)}
                  currency={currency}
                  imageUrl={service.image_urls?.[0]}
                  durationMinutes={service.duration_minutes}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No services available
            </div>
          )}
        </TabsContent>

        {hasPackages && (
          <TabsContent value="packages" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {packages.map((pkg) => (
                <ItemCard
                  key={pkg.id}
                  type="package"
                  id={pkg.id}
                  name={pkg.name}
                  description={pkg.description}
                  price={Number(pkg.price)}
                  originalPrice={pkg.original_price ? Number(pkg.original_price) : undefined}
                  currency={currency}
                  imageUrl={pkg.image_urls?.[0]}
                />
              ))}
            </div>
          </TabsContent>
        )}

        {hasProducts && (
          <TabsContent value="products" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {products.map((product) => (
                <ItemCard
                  key={product.id}
                  type="product"
                  id={product.id}
                  name={product.name}
                  description={product.description}
                  price={Number(product.price)}
                  currency={currency}
                  imageUrl={product.image_urls?.[0]}
                  stockQuantity={product.stock_quantity}
                />
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
