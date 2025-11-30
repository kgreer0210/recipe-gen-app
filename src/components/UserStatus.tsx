"use client";

import { useStore } from "@/lib/store";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, User as UserIcon, CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

export default function UserStatus({ onAction }: { onAction?: () => void }) {
  const { user, subscription, loading } = useAuth();
  const { fetchData } = useStore();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, subscription, loading, fetchData]);

  const handleSignOut = async () => {
    onAction?.();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out error:", error);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const handleManageSubscription = async () => {
    onAction?.();
    setPortalLoading(true);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to open portal");
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Portal error:", error);
      alert("Failed to open subscription management.");
    } finally {
      setPortalLoading(false);
    }
  };

  const isSubscribed =
    subscription &&
    (subscription.status === "active" || subscription.status === "trialing");

  if (loading) {
    return (
      <div className="h-8 w-20 bg-gray-100 animate-pulse rounded-md"></div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        onClick={() => onAction?.()}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
      >
        Sign In
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {isSubscribed && (
        <button
          onClick={handleManageSubscription}
          disabled={portalLoading}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 transition-colors"
          title="Manage Subscription"
        >
          {portalLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Subscription</span>
        </button>
      )}
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <UserIcon className="w-4 h-4" />
        <span className="hidden sm:inline">{user.email}</span>
      </div>
      <button
        onClick={handleSignOut}
        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
        title="Sign Out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
