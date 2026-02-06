import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  usePublicSalon,
  usePublicCatalog,
  BookingCartProvider,
} from "@/hooks/booking";
import { BookingLayout } from "./components/BookingLayout";
import { SalonHeader } from "./components/SalonHeader";
import { CatalogView } from "./components/CatalogView";
import { CartDrawer } from "./components/CartDrawer";
import { BookingWizard } from "./components/BookingWizard";
import { Skeleton } from "@/components/ui/skeleton";

function BookingPageContent() {
  const { slug } = useParams<{ slug: string }>();
  const { salon, locations, isLoading: salonLoading, notFound } = usePublicSalon(slug);
  const { services, packages, products, categories, isLoading: catalogLoading } = usePublicCatalog(salon?.id);
  const [cartOpen, setCartOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

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
        onCartClick={() => setCartOpen(true)}
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

      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        currency={salon.currency}
        tenantId={salon.id}
        locations={locations}
        onCheckout={() => {
          setCartOpen(false);
          setWizardOpen(true);
        }}
      />

      <BookingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
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
