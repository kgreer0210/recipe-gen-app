import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export function useSignOut() {
    const queryClient = useQueryClient();
    const { supabase } = useAuth();
    const router = useRouter();

    return useMutation({
        mutationFn: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.clear(); // Clear all data from cache
            router.push("/");
            router.refresh();
        },
    });
}
