"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { useBusyWeek } from "@/hooks/useBusyWeek";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import {
  BUSY_WEEK_MAX_PICKS,
  dayIsPast,
  findDinnerConflicts,
  suggestDay,
} from "@/lib/busyWeek";
import { formatWeekRange, getZonedYmd } from "@/lib/week";
import {
  CUISINE_TYPES,
  DAY_LABELS,
  MEAL_STYLES,
  type BusyWeekPick,
  type BusyWeekResult,
  type CuisineType,
  type MealStyle,
} from "@/types";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type Draft = {
  id: number;
  cuisine: CuisineType;
  mealStyle: MealStyle;
  dayOfWeek: number;
  /** The user ticked "Replace" for this day's existing dinner. */
  replaceConfirmed: boolean;
};

export default function BusyWeekSheet({
  weekStart,
  timezone,
  onClose,
}: {
  weekStart: string;
  timezone: string;
  onClose: () => void;
}) {
  const slots = useWeeklyPlanStore((state) => state.slots);
  const recipes = useRecipesStore((state) => state.recipes);
  const { phase, batch, error, submit } = useBusyWeek(weekStart);

  const today = useMemo(() => getZonedYmd(new Date(), timezone), [timezone]);
  const weekSlots = useMemo(
    () => slots.filter((slot) => slot.weekStart === weekStart),
    [slots, weekStart]
  );

  // Confirmed replacements by day, so a retry keeps the same replacement.
  const replaceByDay = useRef(new Map<number, string>());
  const [drafts, setDrafts] = useState<Draft[]>(() => [
    {
      id: 1,
      cuisine: CUISINE_TYPES[0],
      mealStyle: "Any",
      dayOfWeek: firstOpenDay(weekStart, today, new Set()) ?? 0,
      replaceConfirmed: false,
    },
  ]);

  // Remaining generations this week. Null means unlimited (admin).
  const [remaining, setRemaining] = useState<{ loaded: boolean; value: number | null }>({
    loaded: false,
    value: null,
  });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/rate-limit", { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setRemaining({ loaded: true, value: data.generate?.remaining ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setRemaining({ loaded: true, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const picks: BusyWeekPick[] = drafts.map((draft) => ({
    cuisine: draft.cuisine,
    mealStyle: draft.mealStyle,
    dayOfWeek: draft.dayOfWeek,
  }));
  const conflicts = findDinnerConflicts(picks, weekSlots, weekStart);
  const recipeTitle = (recipeId: string) =>
    recipes.find((recipe) => recipe.id === recipeId)?.title ?? "a dinner";

  const usedDays = (exceptId?: number) =>
    new Set(drafts.filter((draft) => draft.id !== exceptId).map((draft) => draft.dayOfWeek));

  const updateDraft = (id: number, patch: Partial<Draft>) => {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== id) return draft;
        const dayChanged = patch.dayOfWeek !== undefined && patch.dayOfWeek !== draft.dayOfWeek;
        return { ...draft, ...patch, replaceConfirmed: dayChanged ? false : (patch.replaceConfirmed ?? draft.replaceConfirmed) };
      })
    );
  };

  const addDraft = () => {
    if (drafts.length >= BUSY_WEEK_MAX_PICKS) return;
    const unavailable = usedDays();
    for (let day = 0; day < 7; day += 1) {
      if (dayIsPast(weekStart, day, today)) unavailable.add(day);
    }
    const day = suggestDay(weekStart, today, unavailable);
    if (day === null) return;
    const id = Math.max(0, ...drafts.map((draft) => draft.id)) + 1;
    setDrafts((current) => [
      ...current,
      { id, cuisine: CUISINE_TYPES[0], mealStyle: "Any", dayOfWeek: day, replaceConfirmed: false },
    ]);
  };

  const removeDraft = (id: number) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const allDaysOpen = drafts.every((draft) => !dayIsPast(weekStart, draft.dayOfWeek, today));
  const replacementsConfirmed = drafts.every(
    (draft, index) => !conflicts[index] || draft.replaceConfirmed
  );
  const count = drafts.length;
  const replaceCount = conflicts.filter(Boolean).length;
  const enoughLeft = remaining.value === null || count <= remaining.value;
  const canGenerate =
    phase === "idle" &&
    count > 0 &&
    allDaysOpen &&
    replacementsConfirmed &&
    remaining.loaded &&
    enoughLeft;

  const generate = () => {
    if (!canGenerate) return;
    const nextReplace = new Map<number, string>();
    const payload: BusyWeekPick[] = drafts.map((draft, index) => {
      const conflict = conflicts[index];
      if (conflict && draft.replaceConfirmed) {
        nextReplace.set(draft.dayOfWeek, conflict.id);
        return { cuisine: draft.cuisine, mealStyle: draft.mealStyle, dayOfWeek: draft.dayOfWeek, replaceSlotId: conflict.id };
      }
      return { cuisine: draft.cuisine, mealStyle: draft.mealStyle, dayOfWeek: draft.dayOfWeek };
    });
    replaceByDay.current = nextReplace;
    void submit(payload);
  };

  const retryFailed = (results: BusyWeekResult[]) => {
    const failed = results.filter((result) => result.status === "failed");
    if (failed.length === 0 || phase !== "done") return;
    void submit(
      failed.map((result) => {
        const replaceSlotId = replaceByDay.current.get(result.dayOfWeek);
        return {
          cuisine: result.cuisine,
          mealStyle: result.mealStyle,
          dayOfWeek: result.dayOfWeek,
          ...(replaceSlotId ? { replaceSlotId } : {}),
        };
      })
    );
  };

  const showSummary = phase !== "idle" || batch !== null;
  const results = batch?.results ?? [];
  const finished = results.filter((result) => result.status !== "pending").length;
  const placedCount = results.filter((result) => result.status !== "failed" && result.status !== "pending").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const refunded = batch?.usage.refunded ?? 0;
  const total = results.length || count;

  return (
    <ModalShell
      labelledBy="busy-week-title"
      onClose={onClose}
      panelClassName="max-w-lg overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--market-ink)] bg-[var(--market-surface)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="busy-week-title" className="font-serif text-2xl text-[var(--market-ink)]">
            Busy week
          </h2>
          <p className="mt-1 text-sm text-[var(--market-copy)]">
            {formatWeekRange(weekStart)} · dinners only
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close busy week"
          className="rounded-xl border border-[var(--market-line)] p-2 hover:bg-[var(--market-surface-muted)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!showSummary && (
        <div className="mt-5 flex max-h-[min(60dvh,28rem)] flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
          {drafts.map((draft, index) => {
            const conflict = conflicts[index];
            const otherDays = usedDays(draft.id);
            return (
              <section
                key={draft.id}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--market-line)] bg-[var(--market-surface)] p-3"
              >
                <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[var(--market-muted)]">
                  <span>Dinner {index + 1}</span>
                  {drafts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDraft(draft.id)}
                      aria-label={`Remove dinner ${index + 1}`}
                      className="rounded-md p-1 hover:bg-[var(--market-surface-muted)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--market-copy)]">
                  Cuisine
                  <select
                    value={draft.cuisine}
                    onChange={(event) => updateDraft(draft.id, { cuisine: event.target.value as CuisineType })}
                    className="h-11 w-full rounded-xl border border-[var(--market-line)] bg-[var(--market-surface)] px-3 text-base text-[var(--market-ink)]"
                  >
                    {CUISINE_TYPES.map((cuisine) => (
                      <option key={cuisine} value={cuisine}>
                        {cuisine}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--market-copy)]">Meal style · optional</span>
                  <div role="radiogroup" aria-label={`Meal style for dinner ${index + 1}`} className="flex flex-wrap gap-1.5">
                    {MEAL_STYLES.map((style) => (
                      <button
                        key={style}
                        type="button"
                        role="radio"
                        aria-checked={draft.mealStyle === style}
                        onClick={() => updateDraft(draft.id, { mealStyle: style })}
                        className={`rounded-full border-[1.5px] px-2.5 py-1 text-xs font-medium ${
                          draft.mealStyle === style
                            ? "border-[var(--market-tomato)] bg-[#f7ded3] text-[var(--market-tomato-dark)]"
                            : "border-[var(--market-line)] bg-[var(--market-surface)] text-[var(--market-copy)]"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--market-copy)]">Day</span>
                  <div role="radiogroup" aria-label={`Day for dinner ${index + 1}`} className="grid grid-cols-7 gap-1">
                    {DAY_LETTERS.map((letter, day) => {
                      const past = dayIsPast(weekStart, day, today);
                      const taken = otherDays.has(day);
                      const occupied = weekSlots.some(
                        (slot) => slot.dayOfWeek === day && slot.mealSlot === "dinner"
                      );
                      const selected = draft.dayOfWeek === day;
                      return (
                        <button
                          key={day}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={`${DAY_LABELS[day]}${past ? ", past" : ""}${taken ? ", used by another dinner" : ""}${occupied ? ", has a dinner" : ""}`}
                          disabled={past || taken}
                          onClick={() => updateDraft(draft.id, { dayOfWeek: day })}
                          className={`relative flex h-9 items-center justify-center rounded-[10px] border text-xs font-semibold disabled:cursor-not-allowed ${
                            selected
                              ? "border-[var(--market-tomato)] bg-[var(--market-tomato)] text-[#fff7ec]"
                              : past
                                ? "border-[var(--market-surface-muted)] bg-[var(--market-surface-muted)] text-[#c6bcae] line-through"
                                : taken
                                  ? "border-[var(--market-line)] text-[#c6bcae]"
                                  : "border-[var(--market-line)] bg-[var(--market-surface)] text-[#59584e]"
                          }`}
                        >
                          {letter}
                          {occupied && !selected && (
                            <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--market-tomato)]" aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {conflict && (
                  <div className="flex flex-col gap-2 rounded-xl border border-[#e1cb82] bg-[#f7edc9] p-2.5 text-xs text-[#756021]">
                    <p className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>
                        <strong>{DAY_LABELS[draft.dayOfWeek]} already has a dinner:</strong>{" "}
                        {recipeTitle(conflict.recipeId)}. It stays in your collection, only this day changes.
                      </span>
                    </p>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={draft.replaceConfirmed}
                        onChange={(event) => updateDraft(draft.id, { replaceConfirmed: event.target.checked })}
                        className="h-4 w-4 accent-[var(--market-tomato)]"
                      />
                      Replace {DAY_LABELS[draft.dayOfWeek]}&apos;s dinner
                    </label>
                  </div>
                )}
              </section>
            );
          })}

          <button
            type="button"
            onClick={addDraft}
            disabled={drafts.length >= BUSY_WEEK_MAX_PICKS}
            className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--market-line)] py-2.5 text-sm font-medium text-[var(--market-copy)] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add another ({drafts.length} of {BUSY_WEEK_MAX_PICKS})
          </button>
        </div>
      )}

      {showSummary && (
        <div className="mt-5 flex max-h-[min(60dvh,28rem)] flex-col gap-3 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
          <div>
            <div className="flex items-center justify-between text-sm font-semibold text-[var(--market-ink)]">
              <span>{finished} of {total} ready</span>
              <span className="text-xs font-normal text-[var(--market-copy)]">
                {phase === "running" ? "You can leave this screen" : "Finished"}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--market-surface-muted)]">
              <div
                className="h-full bg-[var(--market-tomato)] transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${total ? (finished / total) * 100 : 0}%` }}
              />
            </div>
          </div>

          {phase === "done" && failedCount > 0 && (
            <p className="rounded-xl border border-[#f1b8a8] bg-[#f8e0d9] p-3 text-sm text-[#b64e3c]">
              {placedCount} of {total} dinners added. {failedCount} failed
              {refunded > 0 ? " and was not charged." : "."}
            </p>
          )}
          {phase === "done" && failedCount === 0 && batch && (
            <p className="rounded-xl border border-[#c6d69e] bg-[#edf3dc] p-3 text-sm text-[#56692c]">
              All {total} dinners are in your plan.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-[#f1b8a8] bg-[#f8e0d9] p-3 text-sm text-[#b64e3c]">
              {error}
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {results.map((result) => (
              <li
                key={result.index}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--market-line)] bg-[var(--market-surface)] p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{result.recipe?.title ?? `${result.cuisine} · ${result.mealStyle}`}</p>
                  <p className="text-xs text-[var(--market-copy)]">
                    {result.cuisine} · {result.mealStyle} · {DAY_SHORT[result.dayOfWeek]}
                  </p>
                </div>
                <StatusBadge result={result} />
              </li>
            ))}
          </ul>

          {!error && results.length === 0 && phase === "running" && (
            <p className="flex items-center gap-2 text-sm text-[var(--market-copy)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Starting…
            </p>
          )}
        </div>
      )}

      {error && !showSummary && (
        <p role="alert" className="mt-4 rounded-xl border border-[#f1b8a8] bg-[#f8e0d9] p-3 text-sm text-[#b64e3c]">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {!showSummary && (
          <>
            <div className="rounded-xl border border-[#c6d69e] bg-[#edf3dc] p-2.5 text-xs text-[var(--market-copy)]">
              {!remaining.loaded
                ? "Checking your remaining recipes…"
                : remaining.value === null
                  ? `This will use ${count} ${count === 1 ? "dinner" : "dinners"} this week.`
                  : enoughLeft
                    ? `This will use ${count} of your ${remaining.value} remaining recipes this week.`
                    : `Not enough left this week: this needs ${count} and you have ${remaining.value}. Remove a dinner to continue.`}
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--market-tomato)] px-6 py-3 font-semibold text-[#fff7ec] shadow-[0_12px_24px_rgba(175,62,39,0.22)] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Generate {count} {count === 1 ? "dinner" : "dinners"}
              {replaceCount > 0 ? ` · ${replaceCount} replace` : ""}
            </button>
            {!replacementsConfirmed && (
              <p className="text-center text-[11px] text-[var(--market-muted)]">
                Tick &quot;Replace&quot; on a day that already has a dinner to continue.
              </p>
            )}
          </>
        )}

        {phase === "running" && (
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#eaa797] px-6 py-3 font-semibold text-[#fff7ec]"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Generating…
          </button>
        )}

        {phase === "done" && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full bg-[var(--market-surface-muted)] px-6 py-3 font-semibold text-[var(--market-copy)]"
            >
              Done
            </button>
            {failedCount > 0 && (
              <button
                type="button"
                onClick={() => retryFailed(results)}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--market-tomato)] px-6 py-3 font-semibold text-[#fff7ec]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Retry failed ({failedCount})
              </button>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function StatusBadge({ result }: { result: BusyWeekResult }) {
  const base = "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold";
  switch (result.status) {
    case "placed":
      return <span className={`${base} bg-[#dfeac2] text-[#56692c]`}>Placed · {DAY_SHORT[result.dayOfWeek]}</span>;
    case "replaced":
      return <span className={`${base} bg-[#dfeac2] text-[#56692c]`}>Replaced · {DAY_SHORT[result.dayOfWeek]}</span>;
    case "unscheduled":
      return <span className={`${base} bg-[#eee6d8] text-[#777568]`}>In your tray</span>;
    case "failed":
      return <span className={`${base} bg-[#f8e0d9] text-[#b64e3c]`}>Failed</span>;
    default:
      return <span className={`${base} bg-[#f7ded3] text-[#bb4e37]`}>Making…</span>;
  }
}

function firstOpenDay(weekStart: string, today: string, unavailable: Set<number>): number | null {
  const open = new Set(unavailable);
  for (let day = 0; day < 7; day += 1) {
    if (dayIsPast(weekStart, day, today)) open.add(day);
  }
  return suggestDay(weekStart, today, open);
}
