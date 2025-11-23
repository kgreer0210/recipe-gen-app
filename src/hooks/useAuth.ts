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

    const getUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (mounted) {
          setUser(user);

          if (user) {
            const { data: subscription, error } = await supabase
              .from("subscriptions")
              .select("*")
              .eq("user_id", user.id)
              .maybeSingle();

            if (mounted) {
              if (error) {
                if (error.code === "PGRST116") {
                  // PGRST116 is "not found" which is fine - user just doesn't have a subscription
                  console.log("No subscription found for user");
                } else {
                  console.error("Error fetching subscription:", error);
                }
              }
              setSubscription(subscription as Subscription | null);
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
          const { data: sub, error } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

          if (mounted) {
            if (error) {
              if (error.code === "PGRST116") {
                // PGRST116 is "not found" which is fine - user just doesn't have a subscription
                console.log("No subscription found for user");
              } else {
                console.error("Error fetching subscription:", error);
              }
            }
            setSubscription(sub as Subscription | null);
          }
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
