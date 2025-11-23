import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

export interface Subscription {
  id: string;
  user_id: string;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete"
    | "incomplete_expired"
    | "paused";
  price_id: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let mounted = true;

    const fetchSubscription = async (userId: string) => {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Subscription fetch timeout")),
            2000
          )
        );

        const dbPromise = supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        // Race the DB call against the timeout
        // If timeoutPromise rejects first, it throws an error caught below
        const result = await Promise.race([dbPromise, timeoutPromise]);

        const { data, error } = result as any;

        if (error) {
          if (error.code === "PGRST116") {
            // Not found is fine
            return null;
          }
          console.error("Error fetching subscription:", error);
          return null;
        }

        return data as Subscription | null;
      } catch (error) {
        console.error("Subscription fetch failed or timed out:", error);
        return null;
      }
    };

    const getUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (mounted) {
          setUser(user);

          if (user) {
            const sub = await fetchSubscription(user.id);
            if (mounted) {
              setSubscription(sub);
            }
          } else {
            if (mounted) setSubscription(null);
          }
        }
      } catch (error) {
        console.error("Error checking auth:", error);
        if (mounted) {
          setSubscription(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    getUser();

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        const user = session?.user ?? null;
        if (mounted) setUser(user);

        if (user) {
          const sub = await fetchSubscription(user.id);
          if (mounted) setSubscription(sub);
        } else {
          if (mounted) setSubscription(null);
        }
      } catch (error) {
        console.error("Error in auth state change:", error);
        if (mounted) {
          setSubscription(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.unsubscribe();
    };
  }, [supabase]);

  return { user, subscription, loading };
}
