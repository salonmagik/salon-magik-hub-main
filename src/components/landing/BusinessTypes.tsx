import { Link } from "react-router-dom";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import salonImage from "@/assets/landing/salon-category.jpg";
import barberImage from "@/assets/landing/barber-category.jpg";
import nailsImage from "@/assets/landing/nails-category.jpg";
import spaImage from "@/assets/landing/spa-category.jpg";

const businessTypes = [
  {
    name: "Hair Salon",
    description: "Natural hair, braiding, styling & color",
    image: salonImage,
  },
  {
    name: "Barbershop",
    description: "Fades, cuts & grooming services",
    image: barberImage,
  },
  {
    name: "Nail Studio",
    description: "Manicures, pedicures & nail art",
    image: nailsImage,
  },
  {
    name: "Spa & Wellness",
    description: "Facials, massage & body treatments",
    image: spaImage,
  },
];

interface BusinessTypesProps {
  isWaitlistMode: boolean;
}

export function BusinessTypes({ isWaitlistMode }: BusinessTypesProps) {
  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Built for every beauty business
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Whether you're a solo braider or managing multiple locations, 
            Salon Magik adapts to how you work.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {businessTypes.map((type) => (
            <Link
              key={type.name}
              to={isWaitlistMode ? "#waitlist" : "/signup"}
              className="group relative overflow-hidden rounded-lg"
            >
              <AspectRatio ratio={1}>
                <img
                  src={type.image}
                  alt={type.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 text-primary-foreground">
                  <h3 className="text-lg font-medium">{type.name}</h3>
                  <p className="text-sm opacity-90">{type.description}</p>
                </div>
              </AspectRatio>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
