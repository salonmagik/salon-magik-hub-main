import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export type DeletionRequestStatus = "pending" | "approved" | "rejected";

export interface DeletionRequest {
  id: string;
  tenant_id: string;
  item_id: string;
  item_type: "service" | "product" | "package" | "voucher";
  item_name: string;
  requested_by_id: string;
  requested_at: string;
  reason: string;
  status: DeletionRequestStatus;
  reviewed_by_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export function useDeletionRequests() {
  const { currentTenant, user } = useAuth();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!currentTenant?.id) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("catalog_deletion_requests")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setRequests((data as DeletionRequest[]) || []);
    } catch (err) {
      console.error("Error fetching deletion requests:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const pendingRequests = requests.filter((r) => r.status === "pending");

  const createRequest = async (
    itemId: string,
    itemType: "service" | "product" | "package" | "voucher",
    itemName: string,
    reason: string
  ) => {
    if (!currentTenant?.id || !user?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("catalog_deletion_requests")
        .insert({
          tenant_id: currentTenant.id,
          item_id: itemId,
          item_type: itemType,
          item_name: itemName,
          requested_by_id: user.id,
          reason,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ 
        title: "Request Submitted", 
        description: "Deletion request sent to owner for approval" 
      });
      
      // Create notification for owners
      await supabase
        .from("notifications")
        .insert({
          tenant_id: currentTenant.id,
          type: "deletion_request",
          title: "Deletion Request",
          description: `Request to delete ${itemType}: ${itemName}`,
          entity_type: "catalog_deletion_request",
          entity_id: data.id,
          urgent: false,
        });

      await fetchRequests();
      return data;
    } catch (err) {
      console.error("Error creating deletion request:", err);
      toast({ title: "Error", description: "Failed to submit request", variant: "destructive" });
      return null;
    }
  };

  const approveRequest = async (requestId: string) => {
    if (!user?.id) return false;

    try {
      const request = requests.find((r) => r.id === requestId);
      if (!request) throw new Error("Request not found");

      // Update request status
      const { error: updateError } = await supabase
        .from("catalog_deletion_requests")
        .update({
          status: "approved",
          reviewed_by_id: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      // Soft delete the item
      const deleteData = {
        deleted_at: new Date().toISOString(),
        deleted_by_id: user.id,
        deletion_reason: request.reason,
      };

      let deleteError;
      switch (request.item_type) {
        case "service":
          ({ error: deleteError } = await supabase.from("services").update(deleteData).eq("id", request.item_id));
          break;
        case "product":
          ({ error: deleteError } = await supabase.from("products").update(deleteData).eq("id", request.item_id));
          break;
        case "package":
          ({ error: deleteError } = await supabase.from("packages").update(deleteData).eq("id", request.item_id));
          break;
        case "voucher":
          ({ error: deleteError } = await supabase.from("vouchers").update(deleteData).eq("id", request.item_id));
          break;
      }

      if (deleteError) throw deleteError;

      // Notify requester
      await supabase
        .from("notifications")
        .insert({
          tenant_id: request.tenant_id,
          user_id: request.requested_by_id,
          type: "deletion_approved",
          title: "Deletion Approved",
          description: `Your request to delete "${request.item_name}" was approved`,
          entity_type: request.item_type,
          entity_id: request.item_id,
        });

      toast({ title: "Approved", description: "Item moved to bin" });
      await fetchRequests();
      return true;
    } catch (err) {
      console.error("Error approving request:", err);
      toast({ title: "Error", description: "Failed to approve request", variant: "destructive" });
      return false;
    }
  };

  const rejectRequest = async (requestId: string, rejectionReason: string) => {
    if (!user?.id) return false;

    try {
      const request = requests.find((r) => r.id === requestId);
      if (!request) throw new Error("Request not found");

      const { error } = await supabase
        .from("catalog_deletion_requests")
        .update({
          status: "rejected",
          reviewed_by_id: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq("id", requestId);

      if (error) throw error;

      // Notify requester
      await supabase
        .from("notifications")
        .insert({
          tenant_id: request.tenant_id,
          user_id: request.requested_by_id,
          type: "deletion_rejected",
          title: "Deletion Rejected",
          description: `Your request to delete "${request.item_name}" was rejected: ${rejectionReason}`,
          entity_type: request.item_type,
          entity_id: request.item_id,
        });

      toast({ title: "Rejected", description: "Deletion request rejected" });
      await fetchRequests();
      return true;
    } catch (err) {
      console.error("Error rejecting request:", err);
      toast({ title: "Error", description: "Failed to reject request", variant: "destructive" });
      return false;
    }
  };

  return {
    requests,
    pendingRequests,
    isLoading,
    error,
    refetch: fetchRequests,
    createRequest,
    approveRequest,
    rejectRequest,
  };
}
