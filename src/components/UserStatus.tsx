"use client";

import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSignOut } from "@/hooks/useSignOut";

export default function UserStatus({
  onAction,
  showLabels = false,
}: {
  onAction?: () => void;
  showLabels?: boolean;
}) {
  const { user, loading } = useAuth();
  const { mutateAsync: signOut } = useSignOut();

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

  if (user) {
    return (
      <div
        className={
          showLabels
            ? "flex flex-col items-stretch gap-3 w-full min-w-0"
            : "flex items-center gap-4"
        }
      >
        <div className="market-account__identity flex items-center gap-2 min-w-0">
          <UserIcon className="w-4 h-4 shrink-0 text-gray-700" />
          <span
            className={`${showLabels ? "inline min-w-0 flex-1" : "hidden sm:inline max-w-[180px]"} text-sm text-gray-700 truncate`}
            title={user.email}
          >
            {user.email}
          </span>
          <button
            onClick={handleSignOut}
            type="button"
            className="market-account__signout p-2 text-gray-400 hover:text-red-500 transition-colors relative z-50 shrink-0 ml-auto"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-8 w-20 bg-gray-100 animate-pulse rounded-md"></div>
    );
  }

  return (
    <Link
      href="/login"
      onClick={() => onAction?.()}
      className="market-account__signin px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
    >
      Sign In
    </Link>
  );
}
