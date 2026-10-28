"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { useBusyWeek } from "@/hooks/useBusyWeek";
import { fetchKitchenProfile } from "@/lib/kitchenProfile";
import { disabledProteinChoices, proteinConflictNote } from "@/lib/proteinChoice";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import {
  BUSY_WEEK_MAX_PICKS,
  dayIsPast,
  defaultPickDay,
  findDinnerConflicts,
  progressRows,
  weekHasOpenDay,
} from "@/lib/busyWeek";
import { formatWeekRange, getZonedYmd } from "@/lib/week";
import {
  CUISINE_TYPES,
  DAY_LABELS,
  MEAL_STYLES,
  PROTEIN_CHOICES,
  type BusyWeekPick,
  type BusyWeekResult,
  type CuisineType,
  type MealStyle,
  type ProteinChoice,
} from "@/types";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Footer buttons. The resting state reads as tappable on touch, where there is no hover.
const FOOTER_BUTTON =
  "flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3 font-semibold transition duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--market-tomato-dark)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--market-surface)] active:scale-[0.98] motion-reduce:active:scale-100";
const FOOTER_PRIMARY =
  "bg-[var(--market-tomato)] text-[#fff7ec] shadow-[0_12px_24px_rgba(175,62,39,0.22)] hover:bg-[var(--market-tomato-dark)] active:bg-[var(--market-tomato-dark)]";
const FOOTER_SECONDARY =
  "border-2 border-[var(--market-tomato-dark)] bg-[var(--market-surface)] text-[var(--market-tomato-dark)] hover:bg-[#f7ded3] active:bg-[#f0cdbf]";

/** The rotating box is clipped to its own size, so the spin never adds scrollable overflow to the line it sits in. */
function Spinner() {
  return (
    <span aria-hidden className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
    </span>
  );
}

type Draft = {
  id: number;
  cuisine: CuisineType;
  mealStyle: MealStyle;
  protein: ProteinChoice;
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
  // The picks of the batch on screen. Their rows show as queued before the server answers.
  const [submitted, setSubmitted] = useState<BusyWeekPick[] | null>(null);

  const today = useMemo(() => getZonedYmd(new Date(), timezone), [timezone]);
  const weekSlots = useMemo(
    () => slots.filter((slot) => slot.weekStart === weekStart),
    [slots, weekStart]
  );
  // A week that has fully passed has nothing to plan. Its days are never offered.
  const weekOpen = weekHasOpenDay(weekStart, today);

  // Confirmed replacements by day, so a retry keeps the same replacement.
  const replaceByDay = useRef(new Map<number, string>());
  const [drafts, setDrafts] = useState<Draft[]>(() => [
    {
      id: 1,
      cuisine: CUISINE_TYPES[0],
      mealStyle: "Any",
      protein: "Any",
      dayOfWeek: defaultPickDay(weekStart, today, new Set()) ?? 0,
      replaceConfirmed: false,
    },
  ]);

  // Saved dietary preferences (Settings) decide which proteins can be picked.
  const [savedDietary, setSavedDietary] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchKitchenProfile().then((profile) => {
      if (cancelled) return;
      setSavedDietary(profile.dietaryPreferences);
      // A protein picked before the preferences loaded is reset if they now rule it out.
      const disabled = disabledProteinChoices(profile.dietaryPreferences);
      setDrafts((current) =>
        current.some((draft) => disabled.has(draft.protein))
          ? current.map((draft) => (disabled.has(draft.protein) ? { ...draft, protein: "Any" } : draft))
          : current
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const disabledProteins = disabledProteinChoices(savedDietary);
  const proteinNote = proteinConflictNote(savedDietary);

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
    const day = defaultPickDay(weekStart, today, usedDays());
    if (day === null) return;
    const id = Math.max(0, ...drafts.map((draft) => draft.id)) + 1;
    setDrafts((current) => [
      ...current,
      { id, cuisine: CUISINE_TYPES[0], mealStyle: "Any", protein: "Any", dayOfWeek: day, replaceConfirmed: false },
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
    weekOpen &&
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
      // "Any" is the default, so it is left out of the request.
      const protein = draft.protein === "Any" ? {} : { protein: draft.protein };
      if (conflict && draft.replaceConfirmed) {
        nextReplace.set(draft.dayOfWeek, conflict.id);
        return { cuisine: draft.cuisine, mealStyle: draft.mealStyle, ...protein, dayOfWeek: draft.dayOfWeek, replaceSlotId: conflict.id };
      }
      return { cuisine: draft.cuisine, mealStyle: draft.mealStyle, ...protein, dayOfWeek: draft.dayOfWeek };
    });
    replaceByDay.current = nextReplace;
    setSubmitted(payload);
    void submit(payload);
  };

  const retryFailed = (results: BusyWeekResult[]) => {
    const failed = results.filter((result) => result.status === "failed");
    if (failed.length === 0 || phase !== "done") return;
    const retry = failed.map((result) => {
      const replaceSlotId = replaceByDay.current.get(result.dayOfWeek);
      return {
        cuisine: result.cuisine,
        mealStyle: result.mealStyle,
        ...(result.protein && result.protein !== "Any" ? { protein: result.protein } : {}),
        dayOfWeek: result.dayOfWeek,
        ...(replaceSlotId ? { replaceSlotId } : {}),
      };
    });
    setSubmitted(retry);
    void submit(retry);
  };

  const showSummary = phase !== "idle" || batch !== null;
  const results = progressRows(submitted, batch?.results ?? []);
  const finished = results.filter((result) => result.status !== "pending").length;
  const placedCount = results.filter((result) => result.status !== "failed" && result.status !== "pending").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const refunded = batch?.usage.refunded ?? 0;
  const total = results.length || count;

  return (
    <ModalShell
      labelledBy="busy-week-title"
      onClose={onClose}
      panelClassName="flex max-w-lg flex-col overflow-hidden overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--market-ink)] bg-[var(--market-surface)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="busy-week-title" className="font-serif text-2xl text-[var(--market-ink)]">
            Chef&apos;s Week
          </h2>
          <p className="mt-1 text-sm text-[var(--market-copy)]">
            {formatWeekRange(weekStart)} · dinners only
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Chef's Week"
          className="rounded-xl border border-[var(--market-line)] p-2 hover:bg-[var(--market-surface-muted)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!weekOpen && (
        <p className="mt-5 rounded-xl border border-[var(--market-line)] bg-[var(--market-surface-muted)] p-3 text-sm text-[var(--market-copy)]">
          This week has already passed. Pick the current week or a later one to plan Chef&apos;s Week dinners.
        </p>
      )}

      {/* One body box for the form and the progress view, so the sheet keeps its height when Generate swaps them. */}
      {!showSummary && weekOpen && (
        <div className="mt-5 flex h-[min(60dvh,28rem)] min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
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

                <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-[var(--market-copy)]">
                  Protein · optional
                  <select
                    value={draft.protein}
                    onChange={(event) => updateDraft(draft.id, { protein: event.target.value as ProteinChoice })}
                    className="h-11 w-full min-w-0 rounded-xl border border-[var(--market-line)] bg-[var(--market-surface)] px-3 text-base text-[var(--market-ink)]"
                  >
                    {PROTEIN_CHOICES.map((choice) => (
                      <option key={choice} value={choice} disabled={disabledProteins.has(choice)}>
                        {choice}
                      </option>
                    ))}
                  </select>
                </label>
                {proteinNote && disabledProteins.size > 0 && (
                  <p className="text-xs text-[var(--market-copy)]">
                    {proteinNote}{" "}
                    <Link href="/settings" className="font-semibold text-[var(--market-tomato-dark)] underline">
                      Open Settings
                    </Link>
                  </p>
                )}

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
        <div className="mt-5 flex h-[min(60dvh,28rem)] min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
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
                    {result.cuisine} · {result.mealStyle}
                    {result.protein && result.protein !== "Any" ? ` · ${result.protein}` : ""} · {DAY_SHORT[result.dayOfWeek]}
                  </p>
                </div>
                <StatusBadge result={result} />
              </li>
            ))}
          </ul>

          {!error && results.length === 0 && phase === "running" && (
            <p className="flex items-center gap-2 text-sm text-[var(--market-copy)]">
              <Spinner /> Starting…
            </p>
          )}
        </div>
      )}

      {error && !showSummary && (
        <p role="alert" className="mt-4 rounded-xl border border-[#f1b8a8] bg-[#f8e0d9] p-3 text-sm text-[#b64e3c]">
          {error}
        </p>
      )}

      {/* The form's footer and the progress footer share one grid cell, as tall as the taller of them. The sheet keeps its height when they swap. */}
      <div className="mt-5 grid">
        {weekOpen && (
          <div
            inert={showSummary}
            className={`col-start-1 row-start-1 flex flex-col gap-3 self-end ${showSummary ? "invisible" : ""}`}
          >
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
              {!showSummary && replaceCount > 0 ? ` · ${replaceCount} replace` : ""}
            </button>
            {/* Once the batch starts, the dinners it places count as conflicts. This hidden footer must not grow from that. */}
            {!showSummary && !replacementsConfirmed && (
              <p className="text-center text-[11px] text-[var(--market-muted)]">
                Tick &quot;Replace&quot; on a day that already has a dinner to continue.
              </p>
            )}
          </div>
        )}

        {showSummary && (
          <div className="col-start-1 row-start-1 flex flex-col gap-3 self-end">
            {phase === "running" && (
              <button
                type="button"
                disabled
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#eaa797] px-6 py-3 font-semibold text-[#fff7ec]"
              >
                <Spinner /> Generating…
              </button>
            )}

            {phase === "done" && (
              <div className="flex gap-3">
                {/* Done is the only action unless dinners failed. Then Retry is the primary and Done steps back. */}
                <button
                  type="button"
                  onClick={onClose}
                  className={`${FOOTER_BUTTON} flex-1 ${failedCount > 0 ? FOOTER_SECONDARY : FOOTER_PRIMARY}`}
                >
                  Done
                </button>
                {failedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => retryFailed(results)}
                    className={`${FOOTER_BUTTON} shrink-0 ${FOOTER_PRIMARY}`}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden /> Retry failed ({failedCount})
                  </button>
                )}
              </div>
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
