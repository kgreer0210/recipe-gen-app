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
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const userRef = useRef<User | null>(initialUser);
  const subscriptionRef = useRef<Subscription | null>(initialSubscription);

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
    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      const currentUserId = currentUser?.id ?? null;
      const previousUserId = userRef.current?.id ?? null;

      if (currentUserId !== previousUserId) {
        setUser(currentUser);

        if (currentUser) {
          const sub = await fetchSubscription(currentUser.id);
          setSubscription(sub);
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
        setSubscription(sub);
      }
    });

    return () => {
      authListener.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  useEffect(() => {
    if (
      initialUser?.id !== user?.id ||
      (initialUser === null && user !== null)
    ) {
      setUser(initialUser);
    }

    if (JSON.stringify(initialSubscription) !== JSON.stringify(subscription)) {
      setSubscription(initialSubscription);
    }
  }, [initialUser, initialSubscription]);

  return (
    <AuthContext.Provider
      value={{ user, subscription, loading, refreshSubscription, supabase }}
    >
      {children}
    </AuthContext.Provider>
  );
}
