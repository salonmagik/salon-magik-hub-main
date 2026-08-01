import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface StaffCheckIn {
  id: string;
  tenant_id: string;
  user_id: string;
  location_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
}

function getGeolocation(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

/** The current user's own open (or most recent) check-in for this tenant. */
export function useMyCheckIn() {
  const { currentTenant, user } = useAuth();
  const [checkIn, setCheckIn] = useState<StaffCheckIn | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOpenCheckIn = useCallback(async () => {
    if (!currentTenant?.id || !user?.id) {
      setCheckIn(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await (supabase
        .from("staff_check_ins" as never)
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("user_id", user.id)
        .is("checked_out_at", null)
        .maybeSingle() as unknown as Promise<{ data: StaffCheckIn | null; error: Error | null }>);
      if (fetchError) throw fetchError;
      setCheckIn(data);
    } catch (err) {
      console.error("Error fetching current check-in:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, user?.id]);

  useEffect(() => {
    fetchOpenCheckIn();
  }, [fetchOpenCheckIn]);

  const checkIn_ = async (locationId: string) => {
    if (!currentTenant?.id || !user?.id) throw new Error("No active tenant");
    const position = await getGeolocation();
    const { error: insertError } = await supabase.from("staff_check_ins" as never).insert({
      tenant_id: currentTenant.id,
      user_id: user.id,
      location_id: locationId,
      check_in_latitude: position?.coords.latitude ?? null,
      check_in_longitude: position?.coords.longitude ?? null,
    } as never);
    if (insertError) throw insertError;
    await fetchOpenCheckIn();
  };

  const checkOut = async () => {
    if (!checkIn) throw new Error("Not checked in");
    const position = await getGeolocation();
    const { error: updateError } = await supabase
      .from("staff_check_ins" as never)
      .update({
        checked_out_at: new Date().toISOString(),
        check_out_latitude: position?.coords.latitude ?? null,
        check_out_longitude: position?.coords.longitude ?? null,
      } as never)
      .eq("id", checkIn.id);
    if (updateError) throw updateError;
    await fetchOpenCheckIn();
  };

  return { checkIn, isLoading, error, checkInAt: checkIn_, checkOut, refetch: fetchOpenCheckIn };
}

/** Tenant-wide view of who's currently checked in, for managers. */
export function useActiveCheckIns() {
  const { currentTenant } = useAuth();
  const [checkIns, setCheckIns] = useState<StaffCheckIn[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActive = useCallback(async () => {
    if (!currentTenant?.id) {
      setCheckIns([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await (supabase
        .from("staff_check_ins" as never)
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .is("checked_out_at", null)
        .order("checked_in_at", { ascending: false }) as unknown as Promise<{
        data: StaffCheckIn[] | null;
        error: Error | null;
      }>);
      if (error) throw error;
      setCheckIns(data || []);
    } catch (err) {
      console.error("Error fetching active check-ins:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  const forceCheckOut = async (checkInId: string) => {
    const { error } = await supabase
      .from("staff_check_ins" as never)
      .update({ checked_out_at: new Date().toISOString() } as never)
      .eq("id", checkInId);
    if (error) throw error;
    await fetchActive();
  };

  return { checkIns, isLoading, refetch: fetchActive, forceCheckOut };
}
