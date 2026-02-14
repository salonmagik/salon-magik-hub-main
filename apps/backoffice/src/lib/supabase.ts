import { createSupabaseClient } from "@supabase-client/supabase/client";
export type { Tables } from "@supabase-client/supabase/types";

export const supabase = createSupabaseClient("sb-salonmagik-backoffice");
