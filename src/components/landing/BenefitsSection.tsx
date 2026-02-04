import { CheckCircle } from "lucide-react";

const benefits = [
  "14-day free trial, no card required",
  "Works on any device — phone, tablet, or desktop",
  "Multiple payment methods supported",
  "WhatsApp notifications coming soon",
  "Offline-first design for unreliable networks",
  "Multi-location support from day one",
];

export function BenefitsSection() {
  return (
    <section className="py-16 bg-primary text-primary-foreground px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold mb-4">
              Why you should sign up
            </h2>
            <p className="opacity-90 max-w-md">
              Simple, powerful tools designed for modern salons, spas, and barbershops. 
              Everything you need to run your business.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
