 import { useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/lib/supabase";
 import { toast } from "sonner";
 
 export function useFeatureFlagsAdmin() {
   const queryClient = useQueryClient();
 
   const toggleFlag = useMutation({
     mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
       const { error } = await supabase
         .from("feature_flags")
         .update({ is_enabled: enabled })
         .eq("id", id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
       queryClient.invalidateQueries({ queryKey: ["backoffice-feature-flags"] });
     },
     onError: (error) => {
       toast.error("Failed to toggle flag: " + error.message);
     },
   });
 
   return { toggleFlag };
 }