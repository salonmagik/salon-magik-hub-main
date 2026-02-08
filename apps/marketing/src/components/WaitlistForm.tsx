import { FormEvent, useState } from "react";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";

export function WaitlistForm() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Placeholder: wire to real backend later
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <h3 className="text-xl font-semibold">You're on the list!</h3>
        <p className="text-muted-foreground">
          We’ll notify you as soon as exclusive access opens.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" required placeholder="Ada Okafor" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="business">Salon or business name</Label>
        <Input id="business" name="business" placeholder="Salon Magik Studio" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Anything we should know?</Label>
        <Textarea id="notes" name="notes" placeholder="Tell us about your team, locations, or tools you use." />
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Submitting..." : "Join waitlist"}
      </Button>
    </form>
  );
}
