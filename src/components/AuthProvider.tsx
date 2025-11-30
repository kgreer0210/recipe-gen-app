"use client";

import { createClient } from "@/lib/supabase/client";
import { Subscription } from "@/types";
import { User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  subscription: Subscription | null;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  subscription: null,
  loading: true,
  refreshSubscription: async () => {},
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
    // Don't set loading to true here to avoid flashing, just update data
    const sub = await fetchSubscription(user.id);
    setSubscription(sub);
  };

  useEffect(() => {
    // Listen for auth changes
    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      
      // Only update if user actually changed to avoid unnecessary re-renders
      if (currentUser?.id !== user?.id) {
        setUser(currentUser);
        
        if (currentUser) {
          // If logging in, fetch subscription
          const sub = await fetchSubscription(currentUser.id);
          setSubscription(sub);
        } else {
          // If logging out, clear subscription
          setSubscription(null);
        }
        
        router.refresh(); // Refresh server components
      } else if (event === 'SIGNED_IN' && currentUser && !subscription) {
         // Handle edge case where user is same but we might need to re-fetch subscription
         // e.g. after initial hydration if something was missed, though unlikely with this pattern
         const sub = await fetchSubscription(currentUser.id);
         setSubscription(sub);
      }
    });

    return () => {
      authListener.unsubscribe();
    };
  }, [supabase, router, user, subscription]);

  // Sync state if props change (e.g. after server refresh)
  useEffect(() => {
      // If the server passes down a new user/subscription (e.g. on navigation), sync it.
      // Note: We check for equality to avoid loops, though simple strict equality might fail for objects.
      // Using ID checks is safer.
      if (initialUser?.id !== user?.id) {
          setUser(initialUser);
      }
      // Ideally we would compare content of subscription but for now assume server is truth
      // We'll avoid infinite loops by not depending on `user` or `subscription` state for this effect
      // Just `initialUser` and `initialSubscription`.
      // Actually, be careful here. If client has updated state (e.g. optimistic), we might not want to overwrite immediately unless sure.
      // But since this is "initial" from server components, it usually represents the source of truth on navigation.
      
      // Simple approach: Trust the server prop updates when they change.
      if (JSON.stringify(initialSubscription) !== JSON.stringify(subscription)) {
          setSubscription(initialSubscription);
      }
      if ((initialUser?.id !== user?.id) || (initialUser === null && user !== null)) {
           setUser(initialUser);
      }
  }, [initialUser, initialSubscription]);


  return (
    <AuthContext.Provider
      value={{ user, subscription, loading, refreshSubscription }}
    >
      {children}
    </AuthContext.Provider>
  );
}

