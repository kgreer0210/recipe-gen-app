"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { COMMON_TIMEZONES } from "@/lib/timezone";
import {
  fetchKitchenProfile,
  saveKitchenProfile,
} from "@/lib/kitchenProfile";
import { DIETARY_PREFERENCES_LIST } from "@/types";
import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

export default function UserSettings() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [timezone, setTimezone] = useState("UTC");
  const [defaultServings, setDefaultServings] = useState(4);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [dislikedIngredients, setDislikedIngredients] = useState<string[]>([]);
  const [dislikeInput, setDislikeInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!user || loading) return;
    const load = async () => {
      const profile = await fetchKitchenProfile();
      setTimezone(profile.timezone);
      setDefaultServings(profile.defaultServings);
      setDietaryPreferences(profile.dietaryPreferences);
      setDislikedIngredients(profile.dislikedIngredients);
      setIsLoading(false);
    };
    void load();
  }, [user, loading]);

  const togglePreference = (pref: string) => {
    setDietaryPreferences((current) =>
      current.includes(pref)
        ? current.filter((item) => item !== pref)
        : [...current, pref]
    );
  };

  const addDislike = () => {
    const value = dislikeInput.trim();
    if (!value) return;
    setDislikedIngredients((current) =>
      current.includes(value) ? current : [...current, value]
    );
    setDislikeInput("");
  };

  const handleSave = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveKitchenProfile({
        timezone,
        defaultServings,
        dietaryPreferences,
        dislikedIngredients,
      });
      setSaveSuccess(true);
      toast.success("Kitchen profile saved");
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      toast.error("Failed to save settings");
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
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Kitchen profile</h2>

        <div className="mb-6">
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
            Timezone
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Used for weekly recipe limits and the meal calendar. Limits reset
            every Monday at 00:00 in this timezone.
          </p>
          <select
            id="timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label htmlFor="servings" className="block text-sm font-medium text-gray-700 mb-2">
            Default servings
          </label>
          <input
            id="servings"
            type="number"
            min={1}
            max={12}
            value={defaultServings}
            onChange={(event) =>
              setDefaultServings(
                Math.min(12, Math.max(1, Number(event.target.value) || 1))
              )
            }
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Dietary preferences
          </p>
          <div className="flex flex-wrap gap-2">
            {DIETARY_PREFERENCES_LIST.map((pref) => (
              <button
                key={pref}
                type="button"
                onClick={() => togglePreference(pref)}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  dietaryPreferences.includes(pref)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-200"
                }`}
              >
                {pref}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Ingredients to avoid
          </p>
          <div className="flex gap-2 mb-2">
            <input
              value={dislikeInput}
              onChange={(event) => setDislikeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addDislike();
                }
              }}
              placeholder="e.g. cilantro, mushrooms"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <button
              type="button"
              onClick={addDislike}
              className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {dislikedIngredients.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm"
              >
                {item}
                <button
                  type="button"
                  onClick={() =>
                    setDislikedIngredients((current) =>
                      current.filter((value) => value !== item)
                    )
                  }
                  aria-label={`Remove ${item}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleSave()}
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

      <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Pantry</h3>
        <p className="text-sm text-gray-600 mb-4">
          Track what you already have so grocery lists skip it and pantry-mode
          generation can start from your kitchen.
        </p>
        <Link
          href="/pantry"
          className="inline-flex px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium hover:bg-blue-100"
        >
          Open pantry
        </Link>
      </div>

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
