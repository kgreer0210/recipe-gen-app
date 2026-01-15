"use client";

import { createClient } from "@/lib/supabase/client";
import { Subscription } from "@/types";
import { User } from "@supabase/supabase-js";
import { createContext, useEffect, useState, useRef, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { detectUserTimezone, saveUserTimezone } from "@/lib/timezone";

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
  const pathname = usePathname();
  const [supabase] = useState(() => createClient());

  const userRef = useRef<User | null>(initialUser);
  const effectInitializedRef = useRef(false);

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

  const ensureUserTimezone = async (userId: string) => {
    try {
      // Detect user's timezone from browser
      const detectedTimezone = detectUserTimezone();
      // Save it to the server (will create or update user_settings)
      await saveUserTimezone(detectedTimezone);
    } catch (error) {
      console.error("Failed to set user timezone:", error);
      // Non-critical, don't fail the login
    }
  };

  useEffect(() => {
    // Avoid double-invocation in React Strict Mode dev render
    if (effectInitializedRef.current) {
      return;
    }
    effectInitializedRef.current = true;

    let isMounted = true;

    const bootstrap = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error && process.env.NODE_ENV !== "production") {
          console.warn("Auth bootstrap getSession failed:", error);
        }

        const sessionUser = session?.user ?? null;
        userRef.current = sessionUser;

        if (!isMounted) return;

        setUser(sessionUser);

        if (sessionUser) {
          const sub = await fetchSubscription(sessionUser.id);
          if (isMounted) {
            setSubscription(sub);
          }
          // Ensure user has timezone set (will auto-detect and save if missing)
          await ensureUserTimezone(sessionUser.id);
        } else {
          setSubscription(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const nextUser = session?.user ?? null;
      const previousUserId = userRef.current?.id ?? null;
      const nextUserId = nextUser?.id ?? null;

      const userChanged = nextUserId !== previousUserId;

      if (userChanged) {
        userRef.current = nextUser;
        setUser(nextUser);

        if (nextUser) {
          const sub = await fetchSubscription(nextUser.id);
          if (isMounted) {
            setSubscription(sub);
          }
          // Ensure user has timezone set (will auto-detect and save if missing)
          await ensureUserTimezone(nextUser.id);
        } else {
          setSubscription(null);
          // If the user becomes unauthenticated (e.g., explicit sign-out), send them to sign-in.
          router.replace("/login");
        }

        router.refresh();
        return;
      }

      if (event === "TOKEN_REFRESHED" && nextUser) {
        const sub = await fetchSubscription(nextUser.id);
        if (isMounted) {
          setSubscription(sub);
        }
      }

      if (event === "SIGNED_OUT") {
        userRef.current = null;
        setUser(null);
        setSubscription(null);
        router.replace("/login");
        router.refresh();
      }
    });

    return () => {
      isMounted = false;
      authListener.unsubscribe();
    };
  }, [supabase, router]);

  useEffect(() => {
    // Re-check session when navigating while unauthenticated (server-side login won't emit client events)
    if (loading || userRef.current) return;

    let isMounted = true;

    const recheck = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;
        const sessionUser = session?.user ?? null;
        userRef.current = sessionUser;
        setUser(sessionUser);

        if (sessionUser) {
          const sub = await fetchSubscription(sessionUser.id);
          if (!isMounted) return;
          setSubscription(sub);
          // Ensure user has timezone set
          await ensureUserTimezone(sessionUser.id);
        } else {
          setSubscription(null);
        }
      } catch {
        // ignore
      }
    };

    recheck();

    return () => {
      isMounted = false;
    };
  }, [pathname, loading, supabase]);

  return (
    <AuthContext.Provider
      value={{ user, subscription, loading, refreshSubscription, supabase }}
    >
      {children}
    </AuthContext.Provider>
  );
}
