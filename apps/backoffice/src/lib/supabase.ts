import { createSupabaseClient } from "@supabase-client/supabase/client";
export type { Tables, TablesInsert, TablesUpdate, Json } from "@supabase-client/supabase/types";

export const supabase = createSupabaseClient("sb-salonmagik-backoffice");
