"use client";

import { createClient } from "@/lib/supabase/client";
import { Subscription } from "@/types";
import { User } from "@supabase/supabase-js";
import { createContext, useEffect, useState, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  subscription: Subscription | null;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  supabase: ReturnType<typeof createClient>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  subscription: null,
  loading: true,
  refreshSubscription: async () => {},
  supabase: createClient(),
});

interface AuthProviderProps {
  children: ReactNode;
  initialUser: User | null;
  initialSubscription: Subscription | null;
}

export function AuthProvider({
  children,
  initialUser,
  initialSubscription,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [subscription, setSubscription] = useState<Subscription | null>(
    initialSubscription
  );
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const userRef = useRef<User | null>(initialUser);
  const subscriptionRef = useRef<Subscription | null>(initialSubscription);
  const sessionCheckedRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    subscriptionRef.current = subscription;
  }, [subscription]);

  const fetchSubscription = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching subscription:", error);
        return null;
      }

      return data as Subscription | null;
    } catch (error) {
      console.error("Subscription fetch failed:", error);
      return null;
    }
  };

  const refreshSubscription = async () => {
    if (!user) return;
    const sub = await fetchSubscription(user.id);
    setSubscription(sub);
  };

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const sessionUser = session?.user ?? null;

        if (isMounted) {
          if (sessionUser && sessionUser.id !== userRef.current?.id) {
            setUser(sessionUser);
            const sub = await fetchSubscription(sessionUser.id);
            if (isMounted) {
              setSubscription(sub);
            }
          } else if (!sessionUser && userRef.current) {
            setUser(null);
            setSubscription(null);
          }
          sessionCheckedRef.current = true;
          setLoading(false);
        }
      } catch (error) {
        console.error("Error checking session:", error);
        if (isMounted) {
          sessionCheckedRef.current = true;
          setLoading(false);
        }
      }
    };

    checkSession();

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      const currentUserId = currentUser?.id ?? null;
      const previousUserId = userRef.current?.id ?? null;

      if (event === "INITIAL_SESSION") {
        if (currentUser && currentUser.id !== userRef.current?.id) {
          setUser(currentUser);
          const sub = await fetchSubscription(currentUser.id);
          if (isMounted) {
            setSubscription(sub);
          }
        } else if (!currentUser && userRef.current) {
          setUser(null);
          setSubscription(null);
        }
        if (isMounted) {
          sessionCheckedRef.current = true;
          setLoading(false);
        }
        if (timeoutId) clearTimeout(timeoutId);
      } else if (currentUserId !== previousUserId) {
        setUser(currentUser);

        if (currentUser) {
          const sub = await fetchSubscription(currentUser.id);
          if (isMounted) {
            setSubscription(sub);
          }
        } else {
          setSubscription(null);
        }

        router.refresh();
      } else if (
        event === "SIGNED_IN" &&
        currentUser &&
        !subscriptionRef.current
      ) {
        const sub = await fetchSubscription(currentUser.id);
        if (isMounted) {
          setSubscription(sub);
        }
      }
    });

    timeoutId = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 3000);

    return () => {
      isMounted = false;
      authListener.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  useEffect(() => {
    // Sync from server props only during initial load and before client-side check completes
    // Once client-side check completes, we trust it over server props
    if (loading && !sessionCheckedRef.current) {
      // During loading and before client check, sync from server props
      if (
        initialUser?.id !== user?.id ||
        (initialUser === null && user !== null)
      ) {
        setUser(initialUser);
      }

      if (
        JSON.stringify(initialSubscription) !== JSON.stringify(subscription)
      ) {
        setSubscription(initialSubscription);
      }
    }
    // After client-side check completes, don't override client-detected session
    // This prevents server-side null from overriding client-detected sessions on refresh
  }, [initialUser, initialSubscription, loading]);

  return (
    <AuthContext.Provider
      value={{ user, subscription, loading, refreshSubscription, supabase }}
    >
      {children}
    </AuthContext.Provider>
  );
}
