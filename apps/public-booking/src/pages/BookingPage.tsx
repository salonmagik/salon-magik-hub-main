import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  usePublicSalon,
  usePublicCatalog,
  BookingCartProvider,
} from "@/hooks";
import { BookingLayout } from "./components/BookingLayout";
import { SalonHeader } from "./components/SalonHeader";
import { CatalogView } from "./components/CatalogView";
import { BookingWizard } from "./components/BookingWizard";
import { Skeleton } from "@ui/skeleton";
import { isLightColor } from "@shared/color";

function BookingPageContent() {
  const { slug } = useParams<{ slug: string }>();
  const { salon, locations, isLoading: salonLoading, notFound } = usePublicSalon(slug);
  const { services, packages, products, categories, isLoading: catalogLoading } = usePublicCatalog(salon?.id);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const isLoading = salonLoading || catalogLoading;

  // Dynamic page title for SEO
  useEffect(() => {
    if (salon?.name) {
      document.title = `Book at ${salon.name} | SalonMagik`;
    } else {
      document.title = "Book Appointment | SalonMagik";
    }
    
    return () => {
      document.title = "SalonMagik";
    };
  }, [salon?.name]);

  // Apply brand color theming with proper contrast
  useEffect(() => {
    if (!salon?.brand_color) return;

    const root = document.documentElement;
    const brandColor = salon.brand_color;
    const textColor = isLightColor(brandColor) ? '#1a1a1a' : '#ffffff';
    
    root.style.setProperty('--brand-color', brandColor);
    root.style.setProperty('--brand-foreground', textColor);
    
    return () => {
      root.style.removeProperty('--brand-color');
      root.style.removeProperty('--brand-foreground');
    };
  }, [salon?.brand_color]);

  if (isLoading) {
    return (
      <BookingLayout onCartClick={() => {}} cartCount={0}>
        <div className="space-y-6">
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        </div>
      </BookingLayout>
    );
  }

  if (notFound || !salon) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center max-w-md px-4">
          <h1 className="text-4xl font-bold mb-4">Salon Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This booking page doesn't exist or online booking is not enabled for this salon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <BookingLayout
        salon={salon}
        onCartClick={() => setCheckoutOpen(true)}
      >
        <div className="space-y-8">
          <SalonHeader salon={salon} locations={locations} />
          
          <CatalogView
            services={services}
            packages={packages}
            products={products}
            categories={categories}
            currency={salon.currency}
          />
        </div>
      </BookingLayout>

      <BookingWizard
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        salon={salon}
        locations={locations}
      />
    </>
  );
}

export default function BookingPage() {
  return (
    <BookingCartProvider>
      <BookingPageContent />
    </BookingCartProvider>
  );
}
