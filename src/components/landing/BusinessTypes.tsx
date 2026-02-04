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
    bgColor: "bg-amber-100/80", // brown/warm pastel
  },
  {
    name: "Barbershop",
    description: "Fades, cuts & grooming services",
    image: barberImage,
    bgColor: "bg-sky-100/80", // blue pastel
  },
  {
    name: "Nail Studio",
    description: "Manicures, pedicures & nail art",
    image: nailsImage,
    bgColor: "bg-pink-100/80", // pink pastel
  },
  {
    name: "Spa & Wellness",
    description: "Facials, massage & body treatments",
    image: spaImage,
    bgColor: "bg-yellow-100/80", // gold/yellow pastel
  },
];

interface BusinessTypesProps {
  isWaitlistMode: boolean;
  onWaitlistClick?: () => void;
}

export function BusinessTypes({ isWaitlistMode, onWaitlistClick }: BusinessTypesProps) {
  const handleClick = () => {
    if (isWaitlistMode && onWaitlistClick) {
      onWaitlistClick();
    } else {
      window.location.href = "/signup";
    }
  };

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
            <button
              key={type.name}
              onClick={handleClick}
              className={`group relative overflow-hidden rounded-lg ${type.bgColor} transition-all duration-300 hover:shadow-lg hover:scale-[1.02] text-left`}
            >
              <AspectRatio ratio={1}>
                <div className="w-full h-full p-3">
                  <img
                    src={type.image}
                    alt={type.name}
                    className="w-full h-full object-cover rounded-md transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              </AspectRatio>
              <div className="p-4 pt-0">
                <h3 className="text-lg font-medium text-foreground">{type.name}</h3>
                <p className="text-sm text-muted-foreground">{type.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
