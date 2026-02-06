import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices">;
type InvoiceLineItem = Tables<"invoice_line_items">;

interface InvoiceWithItems extends Invoice {
  invoice_line_items?: InvoiceLineItem[];
}

interface CreateInvoiceData {
  customerId: string;
  appointmentId?: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    serviceId?: string;
    productId?: string;
  }[];
  notes?: string;
  dueDate?: string;
}

export function useInvoices() {
  const { currentTenant } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!currentTenant?.id) {
      setInvoices([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("invoices")
        .select(`
          *,
          invoice_line_items (*)
        `)
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setInvoices((data as InvoiceWithItems[]) || []);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Generate invoice number using the database function
  const generateInvoiceNumber = async (): Promise<string> => {
    if (!currentTenant?.id) throw new Error("No tenant");

    const { data, error } = await supabase.rpc("generate_invoice_number", {
      _tenant_id: currentTenant.id,
    });

    if (error) throw error;
    return data as string;
  };

  // Create a new invoice
  const createInvoice = async (data: CreateInvoiceData): Promise<Invoice | null> => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No tenant selected", variant: "destructive" });
      return null;
    }

    try {
      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber();

      // Calculate totals
      const subtotal = data.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );
      const total = subtotal; // Add tax/discount logic if needed

      // Create invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          tenant_id: currentTenant.id,
          customer_id: data.customerId,
          appointment_id: data.appointmentId || null,
          invoice_number: invoiceNumber,
          subtotal,
          total,
          currency: currentTenant.currency || "USD",
          notes: data.notes || null,
          due_date: data.dueDate || null,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create line items
      if (data.items.length > 0) {
        const lineItems = data.items.map((item) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.quantity * item.unitPrice,
          service_id: item.serviceId || null,
          product_id: item.productId || null,
        }));

        const { error: itemsError } = await supabase
          .from("invoice_line_items")
          .insert(lineItems);

        if (itemsError) throw itemsError;
      }

      toast({ title: "Invoice created", description: `Invoice ${invoiceNumber} created` });
      fetchInvoices();
      return invoice;
    } catch (err) {
      console.error("Error creating invoice:", err);
      toast({
        title: "Error",
        description: "Failed to create invoice",
        variant: "destructive",
      });
      return null;
    }
  };

  // Create invoice from appointment
  const createFromAppointment = async (appointmentId: string): Promise<Invoice | null> => {
    if (!currentTenant?.id) return null;

    try {
      // Fetch appointment with services and products
      const { data: appointment, error: apptError } = await supabase
        .from("appointments")
        .select(`
          *,
          customers (id, full_name),
          appointment_services (id, service_name, price, duration_minutes),
          appointment_products (id, product_name, unit_price, quantity, total_price)
        `)
        .eq("id", appointmentId)
        .single();

      if (apptError) throw apptError;

      // Build line items from services and products
      const items: CreateInvoiceData["items"] = [];

      // Add services
      (appointment.appointment_services || []).forEach((svc: { service_name: string; price: number }) => {
        items.push({
          description: svc.service_name,
          quantity: 1,
          unitPrice: Number(svc.price),
        });
      });

      // Add products
      (appointment.appointment_products || []).forEach((prod: { product_name: string; unit_price: number; quantity: number }) => {
        items.push({
          description: prod.product_name,
          quantity: prod.quantity,
          unitPrice: Number(prod.unit_price),
        });
      });

      return createInvoice({
        customerId: appointment.customer_id,
        appointmentId,
        items,
      });
    } catch (err) {
      console.error("Error creating invoice from appointment:", err);
      toast({
        title: "Error",
        description: "Failed to create invoice from appointment",
        variant: "destructive",
      });
      return null;
    }
  };

  // Send invoice via email
  const sendInvoice = async (invoiceId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.functions.invoke("send-invoice", {
        body: { invoiceId },
      });

      if (error) throw error;

      // Update invoice status
      await supabase
        .from("invoices")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", invoiceId);

      toast({ title: "Invoice sent", description: "Invoice has been emailed to the customer" });
      fetchInvoices();
      return true;
    } catch (err) {
      console.error("Error sending invoice:", err);
      toast({
        title: "Error",
        description: "Failed to send invoice",
        variant: "destructive",
      });
      return false;
    }
  };

  // Mark invoice as paid
  const markAsPaid = async (invoiceId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", invoiceId);

      if (error) throw error;

      toast({ title: "Invoice updated", description: "Invoice marked as paid" });
      fetchInvoices();
      return true;
    } catch (err) {
      console.error("Error updating invoice:", err);
      return false;
    }
  };

  // Void invoice
  const voidInvoice = async (invoiceId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "void" })
        .eq("id", invoiceId);

      if (error) throw error;

      toast({ title: "Invoice voided" });
      fetchInvoices();
      return true;
    } catch (err) {
      console.error("Error voiding invoice:", err);
      return false;
    }
  };

  return {
    invoices,
    isLoading,
    error,
    createInvoice,
    createFromAppointment,
    sendInvoice,
    markAsPaid,
    voidInvoice,
    refetch: fetchInvoices,
  };
}
