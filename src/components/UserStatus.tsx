"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, User as UserIcon, CreditCard, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSignOut } from "@/hooks/useSignOut";

export default function UserStatus({ onAction }: { onAction?: () => void }) {
  const { user, subscription, loading } = useAuth();
  const { mutateAsync: signOut } = useSignOut();
  const [portalLoading, setPortalLoading] = useState(false);

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Sign out clicked");

    try {
      await signOut();
    } finally {
      // Call onAction after sign out (e.g. close mobile menu)
      onAction?.();
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
        type="button"
        className="p-2 text-gray-400 hover:text-red-500 transition-colors relative z-50"
        title="Sign Out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
