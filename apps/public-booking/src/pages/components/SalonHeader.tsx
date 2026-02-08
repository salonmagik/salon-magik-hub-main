import { MapPin, Phone } from "lucide-react";
import { Badge } from "@ui/badge";
import { BannerCarousel } from "@/components/BannerCarousel";
import type { PublicTenant, PublicLocation } from "@/hooks";

interface SalonHeaderProps {
  salon: PublicTenant;
  locations: PublicLocation[];
}

export function SalonHeader({ salon, locations }: SalonHeaderProps) {
  const primaryLocation = locations[0];
  
  return (
    <div className="space-y-4">
      {/* Banner Carousel */}
      {salon.banner_urls && salon.banner_urls.length > 0 ? (
        <BannerCarousel 
          bannerUrls={salon.banner_urls} 
          salonName={salon.name}
          autoPlayInterval={30000}
        />
      ) : (
        /* Salon Info (if no banner) */
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">{salon.name}</h1>
        </div>
      )}

      {/* Location Tags */}
      {locations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locations.map((location) => (
            <Badge key={location.id} variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              {location.name}, {location.city}
            </Badge>
          ))}
        </div>
      )}

      {/* Contact Information */}
      {salon.show_contact_on_booking && (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {salon.contact_phone && (
            <a 
              href={`tel:${salon.contact_phone}`}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Phone className="h-4 w-4" />
              {salon.contact_phone}
            </a>
          )}
          {primaryLocation?.address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {primaryLocation.address}, {primaryLocation.city}
            </div>
          )}
        </div>
      )}

      {/* Status Message */}
      {salon.booking_status_message && (
        <div 
          className="p-4 rounded-lg bg-muted"
          style={{ 
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: salon.brand_color || "#2563EB" 
          }}
        >
          <p className="text-sm text-muted-foreground">{salon.booking_status_message}</p>
        </div>
      )}
    </div>
  );
}
