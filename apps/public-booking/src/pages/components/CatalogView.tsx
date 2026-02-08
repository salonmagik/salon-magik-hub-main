import { useState, useMemo } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@ui/tabs";
import { Input } from "@ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { ItemCard } from "./ItemCard";
import type { PublicService, PublicPackage, PublicProduct, PublicCategory } from "@/hooks";

interface CatalogViewProps {
  services: PublicService[];
  packages: PublicPackage[];
  products: PublicProduct[];
  categories: PublicCategory[];
  currency: string;
}

type SortOption = "name" | "price-asc" | "price-desc";

type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice?: number;
  imageUrls: string[];
  durationMinutes?: number;
  stockQuantity?: number;
  type: "service" | "package" | "product";
  categoryId?: string | null;
};

export function CatalogView({
  services,
  packages,
  products,
  categories,
  currency,
}: CatalogViewProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name");

  // Normalize all items into a common format
  const allItems: CatalogItem[] = useMemo(() => {
    const serviceItems: CatalogItem[] = services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      price: Number(s.price),
      imageUrls: s.image_urls || [],
      durationMinutes: s.duration_minutes,
      type: "service" as const,
      categoryId: s.category_id,
    }));

    const packageItems: CatalogItem[] = packages.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      originalPrice: p.original_price ? Number(p.original_price) : undefined,
      imageUrls: p.image_urls || [],
      type: "package" as const,
    }));

    const productItems: CatalogItem[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      imageUrls: p.image_urls || [],
      stockQuantity: p.stock_quantity,
      type: "product" as const,
    }));

    return [...serviceItems, ...packageItems, ...productItems];
  }, [services, packages, products]);

  // Filter function
  const filterItems = (items: CatalogItem[]) => {
    let filtered = items;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
      );
    }

    // Filter by category (only applies to services)
    if (activeCategory && activeTab === "services") {
      filtered = filtered.filter((item) => item.categoryId === activeCategory);
    }

    return filtered;
  };

  // Sort function
  const sortItems = (items: CatalogItem[]) => {
    return [...items].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        default:
          return 0;
      }
    });
  };

  // Get items for current tab
  const getTabItems = (tab: string): CatalogItem[] => {
    switch (tab) {
      case "all":
        return allItems;
      case "services":
        return allItems.filter((item) => item.type === "service");
      case "packages":
        return allItems.filter((item) => item.type === "package");
      case "products":
        return allItems.filter((item) => item.type === "product");
      default:
        return allItems;
    }
  };

  const displayItems = sortItems(filterItems(getTabItems(activeTab)));

  const renderItemGrid = (items: CatalogItem[]) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          {searchQuery ? "No items match your search" : "No items available"}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item) => (
          <ItemCard
            key={`${item.type}-${item.id}`}
            type={item.type}
            id={item.id}
            name={item.name}
            description={item.description}
            price={item.price}
            originalPrice={item.originalPrice}
            currency={currency}
            imageUrls={item.imageUrls}
            durationMinutes={item.durationMinutes}
            stockQuantity={item.stockQuantity}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search services, packages, products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A-Z</SelectItem>
            <SelectItem value="price-asc">Price: Low to High</SelectItem>
            <SelectItem value="price-desc">Price: High to Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setActiveCategory(null); }}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {renderItemGrid(displayItems)}
        </TabsContent>

        <TabsContent value="services" className="mt-6">
          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-4">
              <button
                onClick={() => setActiveCategory(null)}
                className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: activeCategory === null ? 'var(--brand-color)' : undefined,
                  color: activeCategory === null ? 'white' : undefined,
                }}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors bg-muted hover:bg-muted/80"
                  style={{
                    backgroundColor: activeCategory === cat.id ? 'var(--brand-color)' : undefined,
                    color: activeCategory === cat.id ? 'white' : undefined,
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
          {renderItemGrid(displayItems)}
        </TabsContent>

        <TabsContent value="packages" className="mt-6">
          {renderItemGrid(displayItems)}
        </TabsContent>

        <TabsContent value="products" className="mt-6">
          {renderItemGrid(displayItems)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
