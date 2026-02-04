import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";

const testimonials = [
  {
    quote: "Salon Magik changed how I run my braiding business. My clients love booking online, and I finally have time to focus on my craft instead of chasing appointments.",
    name: "Amara O.",
    role: "Natural Hair Specialist",
    location: "Lagos, Nigeria",
  },
  {
    quote: "The deposit feature alone has saved me thousands. No more no-shows eating into my profits. This is exactly what African salons needed.",
    name: "Thabo M.",
    role: "Barbershop Owner",
    location: "Johannesburg, SA",
  },
  {
    quote: "I manage three nail studios now, and Salon Magik keeps everything organized. The team features let me see what's happening at each location instantly.",
    name: "Grace K.",
    role: "Nail Studio Chain",
    location: "Nairobi, Kenya",
  },
  {
    quote: "Finally, software that understands how we do business here. The offline mode is a lifesaver when the network is down.",
    name: "Fatima B.",
    role: "Spa Owner",
    location: "Accra, Ghana",
  },
];

export function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const current = testimonials[currentIndex];

  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Loved by beauty professionals
          </h2>
          <p className="text-muted-foreground">
            Join hundreds of salons across Africa who trust Salon Magik
          </p>
        </div>

        <Card className="p-8 md:p-12 relative">
          <Quote className="w-12 h-12 text-primary/20 absolute top-6 left-6" />
          
          <div className="text-center space-y-6 pt-8">
            <blockquote className="text-lg md:text-xl leading-relaxed text-foreground max-w-2xl mx-auto">
              "{current.quote}"
            </blockquote>
            
            <div>
              <p className="font-medium">{current.name}</p>
              <p className="text-sm text-muted-foreground">
                {current.role} • {current.location}
              </p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={prev}
              className="rounded-full"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <div className="flex gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentIndex ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
            </div>
            
            <Button
              variant="outline"
              size="icon"
              onClick={next}
              className="rounded-full"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
}
