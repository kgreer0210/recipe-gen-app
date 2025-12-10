import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useGroceryListStore } from "@/lib/stores/groceryListStore";
import { Ingredient } from "@/types";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

function transformGroceryRow(row: any): Ingredient {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    category: row.category,
    isChecked: row.is_checked,
  };
}

export function useGroceryListRealtime() {
  const { supabase, user, loading: authLoading } = useAuth();
  const {
    groceryList,
    loading,
    error,
    setGroceryList,
    addItem,
    updateItem,
    removeItem,
    setLoading,
    setError,
  } = useGroceryListStore();
  const subscriptionRef = useRef<ReturnType<
    typeof supabase.channel
  > | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      setGroceryList([]);
      setError(null);
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const fetchInitialGroceryList = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("grocery_list")
          .select("*")
          .order("created_at", { ascending: false });

        if (fetchError) {
          console.error("Error fetching grocery list:", fetchError);
          throw fetchError;
        }

        if (isMounted) {
          const transformedList = (data || []).map(transformGroceryRow);
          setGroceryList(transformedList);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Failed to fetch grocery list"));
          setLoading(false);
        }
      }
    };

    fetchInitialGroceryList();

    const channel = supabase
      .channel(`grocery_list:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "grocery_list",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (!isMounted) return;

          switch (payload.eventType) {
            case "INSERT":
              addItem(transformGroceryRow(payload.new));
              break;
            case "UPDATE":
              updateItem(transformGroceryRow(payload.new));
              break;
            case "DELETE":
              removeItem(payload.old.id);
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
  }, [supabase, user, authLoading, setGroceryList, addItem, updateItem, removeItem, setLoading, setError]);

  return { groceryList, loading, error };
}

