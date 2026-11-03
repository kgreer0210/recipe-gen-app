"use client";

import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { createContext, useEffect, useState, useRef, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { detectUserTimezone, saveUserTimezone } from "@/lib/timezone";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  supabase: ReturnType<typeof createClient>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  supabase: createClient(),
});

interface AuthProviderProps {
  children: ReactNode;
  initialUser: User | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const [supabase] = useState(() => createClient());

  const userRef = useRef<User | null>(initialUser);

  const ensureUserTimezone = async () => {
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
          // Timezone save is non-blocking so the chrome can render the signed-in user.
          void ensureUserTimezone();
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
          void ensureUserTimezone();
        } else {
          // If the user becomes unauthenticated (e.g., explicit sign-out), send them to sign-in.
          router.replace("/login");
        }

        router.refresh();
        return;
      }

      if (event === "SIGNED_OUT") {
        userRef.current = null;
        setUser(null);
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
          void ensureUserTimezone();
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
    <AuthContext.Provider value={{ user, loading, supabase }}>
      {children}
    </AuthContext.Provider>
  );
}
