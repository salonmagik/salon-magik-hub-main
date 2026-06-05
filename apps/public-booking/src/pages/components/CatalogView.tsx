import { useState, useMemo } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { ItemCard } from "./ItemCard";
import type {
  PublicService,
  PublicPackage,
  PublicProduct,
  PublicCategory,
  PublicLocation,
} from "@/hooks";

interface CatalogViewProps {
  themeKey?: string | null;
  services: PublicService[];
  packages: PublicPackage[];
  products: PublicProduct[];
  categories: PublicCategory[];
  locations: PublicLocation[];
  currency: string;
  strictLocationScope?: boolean;
  strictScopedLocationIds?: string[];
  selectedLocationIds: string[];
  onLocationFilterChange: (locationIds: string[]) => void;
}

type SortOption = "name" | "price-asc" | "price-desc";
type TypeFilter = "all" | "service" | "package" | "product";

type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice?: number;
  imageUrls: string[];
  durationMinutes?: number;
  serviceIds?: string[];
  stockQuantity?: number;
  type: "service" | "package" | "product";
  categoryId?: string | null;
  branches?: { id: string; name: string; city: string | null; country_code: string }[];
  locationIds?: string[];
  locationNames?: string[];
};

export function CatalogView({
  themeKey,
  services,
  packages,
  products,
  categories,
  locations,
  currency,
  strictLocationScope = false,
  strictScopedLocationIds = [],
  selectedLocationIds,
  onLocationFilterChange,
}: CatalogViewProps) {
  const isEcommerceTheme = themeKey === "ecommerce";
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const allItems: CatalogItem[] = useMemo(() => {
    const s: CatalogItem[] = services.map((item) => ({
      id: item.id, name: item.name, description: item.description,
      price: Number(item.price), imageUrls: item.image_urls || [],
      durationMinutes: item.duration_minutes, type: "service" as const,
      categoryId: item.category_id, branches: item.branches ?? [],
      locationIds: item.location_ids ?? [],
      locationNames: Array.from(new Set((item.branches ?? []).map((b) => b.city || b.name))),
    }));
    const p: CatalogItem[] = packages.map((item) => ({
      id: item.id, name: item.name, description: item.description,
      price: Number(item.price), originalPrice: item.original_price ? Number(item.original_price) : undefined,
      imageUrls: item.image_urls || [], durationMinutes: item.duration_minutes || undefined,
      serviceIds: item.service_ids ?? [], type: "package" as const,
      branches: item.branches ?? [], locationIds: item.location_ids ?? [],
      locationNames: Array.from(new Set((item.branches ?? []).map((b) => b.city || b.name))),
    }));
    const r: CatalogItem[] = products.map((item) => ({
      id: item.id, name: item.name, description: item.description,
      price: Number(item.price), imageUrls: item.image_urls || [],
      stockQuantity: item.stock_quantity, type: "product" as const,
      branches: item.branches ?? [], locationIds: item.location_ids ?? [],
      locationNames: Array.from(new Set((item.branches ?? []).map((b) => b.city || b.name))),
    }));
    return [...s, ...p, ...r];
  }, [services, packages, products]);

  const getItemLocationIds = (item: CatalogItem) =>
    item.branches?.length ? item.branches.map((b) => b.id) : item.locationIds ?? [];

  const displayItems = useMemo(() => {
    let items = allItems;
    // Type filter
    if (typeFilter !== "all") items = items.filter((i) => i.type === typeFilter);
    // Category filter (only for services)
    if (activeCategory && typeFilter === "service") items = items.filter((i) => i.categoryId === activeCategory);
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    // Location
    if (strictLocationScope) {
      const allowed = selectedLocationIds.length > 0 ? selectedLocationIds : strictScopedLocationIds;
      if (allowed.length > 0) {
        items = items.filter((i) => { const ids = getItemLocationIds(i); return ids.length > 0 && ids.some((id) => allowed.includes(id)); });
      }
    } else if (selectedLocationIds.length > 0) {
      items = items.filter((i) => { const ids = getItemLocationIds(i); return ids.length === 0 || ids.some((id) => selectedLocationIds.includes(id)); });
    }
    // Sort
    return [...items].sort((a, b) => {
      if (sortBy === "price-asc") return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
  }, [allItems, typeFilter, activeCategory, searchQuery, selectedLocationIds, strictLocationScope, strictScopedLocationIds, sortBy]);

  const counts = useMemo(() => ({
    all: allItems.length,
    service: allItems.filter((i) => i.type === "service").length,
    package: allItems.filter((i) => i.type === "package").length,
    product: allItems.filter((i) => i.type === "product").length,
  }), [allItems]);

  const typeOptions: { value: TypeFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "service", label: "Services" },
    { value: "package", label: "Packages" },
    { value: "product", label: "Products" },
  ];

  const renderGrid = (items: CatalogItem[]) => {
    if (items.length === 0) {
      return (
        <div className="py-20 text-center">
          <p className="text-sm text-gray-400">{searchQuery ? "No items match your search." : "No items available."}</p>
        </div>
      );
    }
    return (
      <div className={isEcommerceTheme
        ? "grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-3"
        : "grid grid-cols-1 gap-4 sm:grid-cols-2"
      }>
        {items.map((item) => (
          <ItemCard
            key={`${item.type}-${item.id}`}
            themeKey={themeKey}
            type={item.type}
            id={item.id}
            name={item.name}
            description={item.description}
            price={item.price}
            originalPrice={item.originalPrice}
            currency={currency}
            imageUrls={item.imageUrls}
            durationMinutes={item.durationMinutes}
            serviceIds={item.serviceIds}
            stockQuantity={item.stockQuantity}
            branches={item.branches}
            locationNames={item.locationNames}
          />
        ))}
      </div>
    );
  };

  /* ── Ecommerce: sidebar layout ─────────────────────────── */
  if (isEcommerceTheme) {
    const SidebarContent = () => (
      <div className="space-y-8">
        {/* Sort */}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Sort By</p>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-8 border-black/15 bg-transparent text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="border-t border-black/8" />

        {/* Type */}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Type</p>
          <ul className="space-y-2.5">
            {typeOptions.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => { setTypeFilter(opt.value); setActiveCategory(null); }}
                  className="flex w-full items-center justify-between text-left text-sm transition-colors"
                  style={{ color: typeFilter === opt.value ? "var(--brand-color)" : "#6b7280" }}
                >
                  <span className={typeFilter === opt.value ? "font-semibold" : ""}>{opt.label}</span>
                  <span className="text-xs text-gray-300">{counts[opt.value]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Categories (only relevant for services) */}
        {categories.length > 0 && (typeFilter === "all" || typeFilter === "service") && (
          <>
            <div className="border-t border-black/8" />
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Category</p>
              <ul className="space-y-2.5">
                <li>
                  <button
                    type="button"
                    onClick={() => setActiveCategory(null)}
                    className="text-sm transition-colors"
                    style={{ color: activeCategory === null ? "var(--brand-color)" : "#6b7280" }}
                  >
                    <span className={activeCategory === null ? "font-semibold" : ""}>All</span>
                  </button>
                </li>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <button
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className="text-sm transition-colors"
                      style={{ color: activeCategory === cat.id ? "var(--brand-color)" : "#6b7280" }}
                    >
                      <span className={activeCategory === cat.id ? "font-semibold" : ""}>{cat.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Location filter */}
        {locations.length > 1 && (
          <>
            <div className="border-t border-black/8" />
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Location</p>
              <ul className="space-y-2.5">
                <li>
                  <button
                    type="button"
                    onClick={() => onLocationFilterChange([])}
                    className="text-sm transition-colors"
                    style={{ color: selectedLocationIds.length === 0 ? "var(--brand-color)" : "#6b7280" }}
                  >
                    <span className={selectedLocationIds.length === 0 ? "font-semibold" : ""}>All locations</span>
                  </button>
                </li>
                {locations.map((loc) => {
                  const active = selectedLocationIds.includes(loc.id);
                  return (
                    <li key={loc.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (active) onLocationFilterChange(selectedLocationIds.filter((id) => id !== loc.id));
                          else onLocationFilterChange([...selectedLocationIds, loc.id]);
                        }}
                        className="text-sm transition-colors"
                        style={{ color: active ? "var(--brand-color)" : "#6b7280" }}
                      >
                        <span className={active ? "font-semibold" : ""}>{loc.city || loc.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>
    );

    return (
      <div id="ecom-catalog" className="mx-auto max-w-7xl px-6 pb-20 pt-12 lg:px-8">
        {/* Mobile filter bar */}
        <div className="mb-8 flex items-center justify-between lg:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filter & Sort
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search…"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="h-9 w-48 border-black/15 pl-9 text-sm"
            />
          </div>
        </div>

        {/* Mobile sidebar drawer */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-white px-6 py-8">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-widest">Filters</span>
                <button type="button" onClick={() => setMobileSidebarOpen(false)}>
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              <SidebarContent />
            </div>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <SidebarContent />
            </div>
          </aside>

          {/* Main content */}
          <div>
            {/* Header row: count + search */}
            <div className="mb-8 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {displayItems.length} {displayItems.length === 1 ? "item" : "items"}
              </p>
              <div className="relative hidden lg:block">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  className="h-9 w-56 border-black/15 pl-9 text-sm"
                />
              </div>
            </div>

            {renderGrid(displayItems)}
          </div>
        </div>
      </div>
    );
  }

  /* ── Default layout ─────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search services, packages, products…"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="price-asc">Price: Low to High</SelectItem>
            <SelectItem value="price-desc">Price: High to Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Type pills for default */}
      <div className="flex flex-wrap gap-2">
        {typeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTypeFilter(opt.value)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${typeFilter === opt.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted/40"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {locations.length > 1 && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onLocationFilterChange([])}
              className={`rounded-full border px-3 py-1.5 text-xs ${selectedLocationIds.length === 0 ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              All locations
            </button>
            {locations.map((loc) => {
              const checked = selectedLocationIds.includes(loc.id);
              return (
                <button key={loc.id} type="button"
                  onClick={() => checked ? onLocationFilterChange(selectedLocationIds.filter((id) => id !== loc.id)) : onLocationFilterChange([...selectedLocationIds, loc.id])}
                  className={`rounded-full border px-3 py-1.5 text-xs ${checked ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                  {loc.city || loc.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {renderGrid(displayItems)}
    </div>
  );
}
