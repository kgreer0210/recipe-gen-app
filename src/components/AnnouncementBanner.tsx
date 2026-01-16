"use client";

import { useState, useEffect } from "react";
import { Smartphone, X, CheckCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const DISMISSED_KEY = "mise_mobile_banner_dismissed";

export default function AnnouncementBanner() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to prevent flash

  useEffect(() => {
    // Check localStorage after mount to avoid SSR mismatch
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    setIsDismissed(dismissed === "true");
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem(DISMISSED_KEY, "true");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("mobile_waitlist")
        .insert({ email: email.trim().toLowerCase() });

      if (error) {
        if (error.code === "23505") {
          // Unique constraint violation - email already exists
          setStatus("success");
          setEmail("");
        } else {
          throw error;
        }
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
      console.error("Waitlist signup error:", err);
    }
  };

  if (isDismissed) return null;

  return (
    <div className="bg-blue-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 py-2.5">
          {/* Message */}
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium truncate">
              Mobile app coming soon!
            </span>
          </div>

          {/* Form or Success Message */}
          <div className="flex items-center gap-2">
            {status === "success" ? (
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span className="hidden sm:inline">
                  You&apos;re on the list!
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email for updates"
                  className="w-36 sm:w-48 px-2.5 py-1 text-sm rounded bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/20"
                  disabled={status === "loading"}
                  required
                />
                <button
                  type="submit"
                  disabled={status === "loading" || !email.trim()}
                  className="px-3 py-1 text-sm font-medium bg-white text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  {status === "loading" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Notify Me"
                  )}
                </button>
              </form>
            )}

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-white/10 rounded transition-colors ml-2"
              aria-label="Dismiss announcement"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Message */}
        {status === "error" && errorMessage && (
          <div className="pb-2 text-sm text-red-200">{errorMessage}</div>
        )}
      </div>
    </div>
  );
}
