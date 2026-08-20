import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePantryStore } from "@/lib/stores/pantryStore";
import type { PantryItem, PantrySource, Unit } from "@/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type PantryRow = {
  id: string;
  name: string;
  name_normalized: string;
  amount: number;
  unit: Unit;
  category: string | null;
  source: PantrySource;
};

export function transformPantryRow(row: PantryRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    nameNormalized: row.name_normalized,
    amount: Number(row.amount),
    unit: row.unit,
    category: row.category ?? undefined,
    source: row.source,
  };
}

export function usePantryRealtime() {
  const { supabase, user, loading: authLoading } = useAuth();
  const {
    pantryItems,
    loading,
    error,
    setPantryItems,
    addItem,
    updateItem,
    removeItem,
    setLoading,
    setError,
  } = usePantryStore();
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      setPantryItems([]);
      setError(null);
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const fetchInitial = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase
          .from("pantry_items")
          .select("id, name, name_normalized, amount, unit, category, source")
          .order("created_at", { ascending: false });
        if (fetchError) throw fetchError;
        if (isMounted) {
          setPantryItems((data || []).map(transformPantryRow));
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err : new Error("Failed to fetch pantry")
          );
          setLoading(false);
        }
      }
    };

    void fetchInitial();

    const channel = supabase
      .channel(`pantry_items:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pantry_items",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<PantryRow>) => {
          if (!isMounted) return;
          switch (payload.eventType) {
            case "INSERT":
              if (payload.new?.id) addItem(transformPantryRow(payload.new as PantryRow));
              break;
            case "UPDATE":
              if (payload.new?.id)
                updateItem(transformPantryRow(payload.new as PantryRow));
              break;
            case "DELETE":
              if (payload.old?.id) removeItem(payload.old.id);
              break;
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [
    supabase,
    user,
    authLoading,
    setPantryItems,
    addItem,
    updateItem,
    removeItem,
    setLoading,
    setError,
  ]);

  return { pantryItems, loading, error };
}
