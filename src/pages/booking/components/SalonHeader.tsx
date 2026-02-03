import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicTenant, PublicLocation } from "@/hooks/booking";

interface SalonHeaderProps {
  salon: PublicTenant;
  locations: PublicLocation[];
}

export function SalonHeader({ salon, locations }: SalonHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Banners */}
      {salon.banner_urls && salon.banner_urls.length > 0 && (
        <div className="relative h-48 md:h-64 rounded-xl overflow-hidden">
          <img
            src={salon.banner_urls[0]}
            alt={`${salon.name} banner`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <h1 className="text-2xl md:text-3xl font-bold">{salon.name}</h1>
          </div>
        </div>
      )}

      {/* Salon Info (if no banner) */}
      {(!salon.banner_urls || salon.banner_urls.length === 0) && (
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

      {/* Status Message */}
      {salon.booking_status_message && (
        <div className="p-4 rounded-lg bg-muted border">
          <p className="text-sm text-muted-foreground">{salon.booking_status_message}</p>
        </div>
      )}
    </div>
  );
}
