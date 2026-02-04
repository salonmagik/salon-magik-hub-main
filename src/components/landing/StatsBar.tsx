const stats = [
  { value: "500+", label: "Salon partners" },
  { value: "15,000+", label: "Appointments booked" },
  { value: "10+", label: "African countries" },
  { value: "4.9", label: "App store rating" },
];

export function StatsBar() {
  return (
    <section className="border-y bg-surface">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl md:text-4xl font-semibold text-primary">
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
