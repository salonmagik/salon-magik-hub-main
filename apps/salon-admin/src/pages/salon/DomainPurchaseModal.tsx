import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@ui/form";
import { toast } from "@ui/ui/use-toast";
import { Loader2 } from "lucide-react";
import type { Tables } from "@supabase-client";

const whoisSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  organization: z.string().optional(),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone is required"),
  address1: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State/Province is required"),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().length(2, "Must be a 2-letter country code"),
});

type WhoisFormValues = z.infer<typeof whoisSchema>;

interface DomainPurchaseModalProps {
  domain: string;
  tenant: Tables<"tenants">;
  price: number;
  currency: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DomainPurchaseModal({
  domain,
  tenant,
  price,
  currency,
  isOpen,
  onOpenChange,
  onSuccess,
}: DomainPurchaseModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<any>(null);

  const form = useForm<WhoisFormValues>({
    resolver: zodResolver(whoisSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      organization: tenant.name || "",
      email: "", // User email could be passed in if available
      phone: tenant.contact_phone || "",
      address1: "",
      city: "",
      state: "",
      postalCode: "",
      country: tenant.country || "US",
    },
  });

  const onSubmit = async (values: WhoisFormValues) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("dotlet-purchase-domain", {
        body: {
          domain,
          tenantId: tenant.id,
          registrant: values,
          admin: values,
          tech: values,
          billing: values,
        },
      });

      if (error) throw error;

      setPurchaseResult(data);
      toast({
        title: "Purchase Order Created",
        description: "Please follow the bank transfer instructions to complete your purchase.",
      });
    } catch (err: any) {
      console.error("Domain purchase error:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to purchase domain.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (purchaseResult) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
          onSuccess();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bank Transfer Instructions</DialogTitle>
            <DialogDescription>
              Your order for {domain} has been placed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg whitespace-pre-wrap text-sm font-mono">
              {purchaseResult.bank_transfer_instructions}
            </div>
            <div className="text-sm">
              <p><strong>Order ID:</strong> {purchaseResult.id}</p>
              <p><strong>Amount Due:</strong> {purchaseResult.currency === "USD" ? "$" : ""}{purchaseResult.price.toFixed(2)} {purchaseResult.currency !== "USD" ? purchaseResult.currency : ""}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Your domain will be configured automatically once payment is received.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              onOpenChange(false);
              onSuccess();
            }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register {domain}</DialogTitle>
          <DialogDescription>
            Enter your contact information for domain registration (WHOIS).
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="organization"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State / Province</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country (2-letter code)</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Purchase for {currency === "USD" ? "$" : ""}{(price).toFixed(2)} {currency !== "USD" ? currency : ""}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
