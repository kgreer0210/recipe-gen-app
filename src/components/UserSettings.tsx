"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchUserTimezone, saveUserTimezone, COMMON_TIMEZONES } from "@/lib/timezone";
import { Loader2, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function UserSettings() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [timezone, setTimezone] = useState<string>("UTC");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load current timezone on mount
  useEffect(() => {
    if (!user || loading) return;

    const loadTimezone = async () => {
      const tz = await fetchUserTimezone();
      setTimezone(tz);
      setIsLoading(false);
    };

    loadTimezone();
  }, [user, loading]);

  const handleTimezoneChange = async (newTimezone: string) => {
    setTimezone(newTimezone);
  };

  const handleSave = async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await saveUserTimezone(timezone);
      setSaveSuccess(true);
      toast.success("Timezone updated successfully");

      // Reset success indicator after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to save timezone:", error);
      toast.error("Failed to save timezone");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Please log in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">User Settings</h2>

        {/* Timezone Setting */}
        <div className="mb-6">
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
            Timezone
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Your timezone is used to calculate weekly recipe generation limits. They reset every Monday at 00:00 in your timezone.
          </p>

          <div className="grid grid-cols-1 gap-3">
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>

            {/* Current timezone display */}
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
              <p>
                <strong>Current timezone:</strong> {timezone}
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>

          {saveSuccess && (
            <div className="flex items-center gap-2 text-green-600">
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium">Saved!</span>
            </div>
          )}
        </div>
      </div>

      {/* Additional Settings */}
      <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Account Information</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-gray-600">Email</p>
            <p className="font-medium text-gray-900">{user.email}</p>
          </div>
          <div>
            <p className="text-gray-600">User ID</p>
            <p className="font-mono text-xs text-gray-600">{user.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
