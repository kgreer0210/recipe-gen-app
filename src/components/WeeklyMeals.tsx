"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  ShoppingBasket,
  Utensils,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWeeklyPlanRealtime } from "@/hooks/useWeeklyPlanRealtime";
import { useRecipesRealtime } from "@/hooks/useRecipesRealtime";
import { usePantryRealtime } from "@/hooks/usePantryRealtime";
import { useGroceryListRealtime } from "@/hooks/useGroceryListRealtime";
import {
  useAddToWeeklyPlanSlot,
  useMarkWeeklyPlanSlotCooked,
  useMoveWeeklyPlanSlot,
  useRemoveWeeklyPlanSlot,
} from "@/hooks/useWeeklyPlanMutations";
import { useBuildGroceryFromWeek } from "@/hooks/useGroceryListMutations";
import { useUpsertPantryItem } from "@/hooks/usePantryMutations";
import { usePantryStore } from "@/lib/stores/pantryStore";
import { uniqueStrings } from "@/lib/kitchenProfile";
import {
  planGrocerySignatureKey,
  weeklyPlanGrocerySignature,
} from "@/lib/stores/weeklyPlanStore";
import { fetchUserTimezone } from "@/lib/timezone";
import {
  addDaysToYmd,
  formatWeekRange,
  getWeekStart,
  getZonedYmd,
  mealSlotLabel,
  nextEmptyDinner,
  shiftWeekStart,
} from "@/lib/week";
import {
  DAY_LABELS,
  MEAL_SLOTS,
  type MealSlot,
  type Recipe,
  type WeeklyPlanSlot,
} from "@/types";
import AddToWeekModal from "@/components/AddToWeekModal";
import LeftoversModal, {
  type LeftoverDraft,
} from "@/components/LeftoversModal";

type PickerState =
  | { type: "cell"; dayOfWeek: number; mealSlot: MealSlot }
  | { type: "recipe"; recipe: Recipe; dayOfWeek?: number; mealSlot?: MealSlot }
  | { type: "unscheduled"; slot: WeeklyPlanSlot };

function cellId(dayOfWeek: number, mealSlot: MealSlot) {
  return `cell:${dayOfWeek}:${mealSlot}`;
}

function parseCellId(
  id: string
): { dayOfWeek: number; mealSlot: MealSlot } | null {
  const match = /^cell:(\d):(breakfast|lunch|dinner|snack)$/.exec(id);
  if (!match) return null;
  return {
    dayOfWeek: Number(match[1]),
    mealSlot: match[2] as MealSlot,
  };
}

function SlotCard({
  slot,
  recipe,
  onMarkCooked,
  onRemove,
}: {
  slot: WeeklyPlanSlot;
  recipe: Recipe | undefined;
  onMarkCooked: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: slot.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : slot.cookedAt ? 0.65 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border p-2 bg-white shadow-sm ${
        slot.cookedAt ? "border-green-200 bg-green-50" : "border-gray-200"
      }`}
    >
      <div
        className="cursor-grab active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <p className="font-semibold text-sm text-gray-900 line-clamp-2">
          {recipe?.title || "Recipe"}
        </p>
        {recipe && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {recipe.prepTime}
          </p>
        )}
      </div>
      {slot.cookedAt && (
        <span className="mt-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-green-700">
          Cooked
        </span>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {recipe && (
          <Link
            href={`/recipe/${recipe.id}/cook?slot=${slot.id}`}
            className="text-[11px] font-medium text-blue-600 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            Cook
          </Link>
        )}
        {!slot.cookedAt && (
          <button
            type="button"
            onClick={onMarkCooked}
            className="text-[11px] font-medium text-green-700 hover:underline"
          >
            Done
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] font-medium text-red-600 hover:underline"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function DropCell({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[108px] rounded-lg p-1 ${
        isOver ? "bg-blue-50 ring-2 ring-blue-200" : ""
      }`}
    >
      {children}
    </div>
  );
}

function UnscheduledTray({
  unscheduled,
  recipesById,
  onAssign,
  onMarkCooked,
  onRemove,
}: {
  unscheduled: WeeklyPlanSlot[];
  recipesById: Map<string, Recipe>;
  onAssign: (slot: WeeklyPlanSlot) => void;
  onMarkCooked: (slot: WeeklyPlanSlot) => void;
  onRemove: (slot: WeeklyPlanSlot) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "tray" });
  return (
    <div
      ref={setNodeRef}
      className={`mt-8 rounded-xl border p-4 ${
        isOver ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Unscheduled
        </h3>
        <span className="text-xs text-gray-500">
          Drag onto a day, or assign with Add
        </span>
      </div>
      {unscheduled.length === 0 ? (
        <p className="text-sm text-gray-500">
          Recipes added without a day land here.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {unscheduled.map((slot) => {
            const recipe = recipesById.get(slot.recipeId);
            return (
              <div key={slot.id} className="relative">
                <SlotCard
                  slot={slot}
                  recipe={recipe}
                  onMarkCooked={() => onMarkCooked(slot)}
                  onRemove={() => onRemove(slot)}
                />
                <button
                  type="button"
                  onClick={() => onAssign(slot)}
                  className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                >
                  Assign to a day
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WeeklyMeals() {
  const router = useRouter();
  const { user } = useAuth();
  const { slots, recipesById } = useWeeklyPlanRealtime();
  const { recipes: collectionRecipes } = useRecipesRealtime();
  usePantryRealtime();
  const { groceryList } = useGroceryListRealtime();
  const { mutateAsync: addToSlot } = useAddToWeeklyPlanSlot();
  const { mutateAsync: moveSlot } = useMoveWeeklyPlanSlot();
  const { mutateAsync: removeSlot } = useRemoveWeeklyPlanSlot();
  const { mutateAsync: markCooked } = useMarkWeeklyPlanSlotCooked();
  const { mutateAsync: buildGrocery, isLoading: isBuilding } =
    useBuildGroceryFromWeek();
  const { mutateAsync: upsertPantry } = useUpsertPantryItem();
  const [timezone, setTimezone] = useState("UTC");
  const [weekStart, setWeekStart] = useState(() =>
    getWeekStart(new Date(), "UTC")
  );
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [leftoversSlot, setLeftoversSlot] = useState<WeeklyPlanSlot | null>(
    null
  );
  const [groceryBuildVersion, setGroceryBuildVersion] = useState(0);

  useEffect(() => {
    void fetchUserTimezone().then((tz) => {
      setTimezone(tz);
      setWeekStart(getWeekStart(new Date(), tz));
    });
  }, []);

  const weekSlots = useMemo(
    () => slots.filter((slot) => slot.weekStart === weekStart),
    [slots, weekStart]
  );
  const unscheduled = weekSlots.filter(
    (slot) => slot.dayOfWeek === null || slot.mealSlot === null
  );
  const occupiedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const slot of weekSlots) {
      if (slot.dayOfWeek !== null && slot.mealSlot) {
        keys.add(`${slot.dayOfWeek}:${slot.mealSlot}`);
      }
    }
    return keys;
  }, [weekSlots]);
  const dinnerSuggestion = nextEmptyDinner(
    weekStart,
    occupiedKeys,
    getZonedYmd(new Date(), timezone)
  );

  const slotByCell = useMemo(() => {
    const map = new Map<string, WeeklyPlanSlot>();
    for (const slot of weekSlots) {
      if (slot.dayOfWeek !== null && slot.mealSlot) {
        map.set(cellId(slot.dayOfWeek, slot.mealSlot), slot);
      }
    }
    return map;
  }, [weekSlots]);

  const planGroceryStale = (() => {
    if (!user) return false;
    const hasPlanGrocery = groceryList.some(
      (item) => item.source === "plan" && item.planWeekStart === weekStart
    );
    if (!hasPlanGrocery) return false;
    const current = weeklyPlanGrocerySignature(weekSlots);
    const saved =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(
            planGrocerySignatureKey(user.id, weekStart)
          );
    return Boolean(saved) && saved !== current && groceryBuildVersion >= 0;
  })();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const overId = event.over?.id ? String(event.over.id) : null;
    const slotId = String(event.active.id);
    if (!overId) return;
    if (overId === "tray") {
      try {
        await moveSlot(slotId, {
          weekStart,
          dayOfWeek: null,
          mealSlot: null,
        });
      } catch {
        toast.error("Could not move that meal");
      }
      return;
    }
    const cell = parseCellId(overId);
    if (!cell) return;
    try {
      await moveSlot(slotId, {
        weekStart,
        dayOfWeek: cell.dayOfWeek,
        mealSlot: cell.mealSlot,
      });
    } catch {
      toast.error("Could not move that meal");
    }
  };

  const handleBuildGrocery = useCallback(async () => {
    try {
      const count = await buildGrocery(weekStart);
      if (user) {
        window.localStorage.setItem(
          planGrocerySignatureKey(user.id, weekStart),
          weeklyPlanGrocerySignature(weekSlots)
        );
      }
      setGroceryBuildVersion((value) => value + 1);

      toast.success(
        <div className="flex items-center justify-between gap-4 w-full">
          <span>
            Added {count} grocery {count === 1 ? "item" : "items"} from this
            week
          </span>
          <Link
            href="/grocery-list"
            className="inline-flex items-center gap-1 px-3 py-1 rounded bg-blue-100 text-blue-700 font-medium"
          >
            View list
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not build a grocery list from this week"
      );
    }
  }, [buildGrocery, user, weekSlots, weekStart]);

  const openLeftoversThen = async (
    slot: WeeklyPlanSlot,
    removeAfter: boolean
  ) => {
    if (!removeAfter) {
      try {
        await markCooked(slot.id, true);
      } catch {
        toast.error("Could not mark this meal as cooked");
        return;
      }
    }
    setLeftoversSlot(slot);
  };

  const saveLeftovers = async (leftovers: LeftoverDraft[]) => {
    for (const leftover of leftovers) {
      await upsertPantry({ ...leftover, source: "leftover" });
    }
    if (leftovers.length > 0) {
      toast.success("Leftovers saved to your pantry");
    }
  };

  const leftoverIngredientQuery = (leftovers: LeftoverDraft[]) => {
    const pantryNames = usePantryStore
      .getState()
      .pantryItems.map((item) => item.name);
    return uniqueStrings([
      ...leftovers.map((item) => item.name),
      ...pantryNames,
    ]).join(",");
  };

  const closeLeftovers = () => {
    const slot = leftoversSlot;
    setLeftoversSlot(null);
    if (slot && (slot.dayOfWeek === null || slot.mealSlot === null)) {
      void removeSlot(slot.id);
    }
  };

  const generateFromLeftovers = (leftovers: LeftoverDraft[]) => {
    closeLeftovers();
    router.push(
      `/generator?mode=pantry&meal=Lunch&ingredients=${encodeURIComponent(
        leftoverIngredientQuery(leftovers)
      )}`
    );
  };

  if (!user) {
    return (
      <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <h3 className="text-lg font-medium text-gray-900">Sign in to plan</h3>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setWeekStart((current) => shiftWeekStart(current, -1))
              }
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center min-w-[180px]">
              <p className="text-sm font-semibold text-gray-900">
                {formatWeekRange(weekStart)}
              </p>
              <button
                type="button"
                onClick={() =>
                  setWeekStart(getWeekStart(new Date(), timezone))
                }
                className="text-xs text-blue-600 hover:underline"
              >
                This week
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                setWeekStart((current) => shiftWeekStart(current, 1))
              }
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleBuildGrocery()}
            disabled={isBuilding}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <ShoppingBasket className="w-4 h-4" />
            {isBuilding ? "Building..." : "Build grocery list from this week"}
          </button>
        </div>
        {planGroceryStale && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-3">
            <span>Your plan changed — rebuild the grocery list?</span>
            <button
              type="button"
              onClick={() => void handleBuildGrocery()}
              className="font-semibold text-amber-900 underline"
            >
              Rebuild
            </button>
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragEnd={(event) => void handleDragEnd(event)}
      >
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[980px] grid grid-cols-7 gap-2">
            {DAY_LABELS.map((label, dayOfWeek) => (
              <div key={label} className="min-w-[132px]">
                <div className="text-center mb-2">
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500">
                    {addDaysToYmd(weekStart, dayOfWeek).slice(5)}
                  </p>
                </div>
                <div className="space-y-2">
                  {MEAL_SLOTS.map((mealSlot) => {
                    const id = cellId(dayOfWeek, mealSlot);
                    const slot = slotByCell.get(id);
                    const recipe = slot
                      ? recipesById.get(slot.recipeId)
                      : undefined;
                    return (
                      <div key={id}>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                          {mealSlotLabel(mealSlot)}
                        </p>
                        <DropCell id={id}>
                          {slot ? (
                            <SlotCard
                              slot={slot}
                              recipe={recipe}
                              onMarkCooked={() =>
                                void openLeftoversThen(
                                  slot,
                                  slot.dayOfWeek === null
                                )
                              }
                              onRemove={() =>
                                void removeSlot(slot.id).then(
                                  () => toast.success("Removed from this week"),
                                  () => toast.error("Could not remove meal")
                                )
                              }
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setPicker({
                                  type: "cell",
                                  dayOfWeek,
                                  mealSlot,
                                })
                              }
                              className="w-full min-h-[96px] rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-600 text-xs font-medium flex flex-col items-center justify-center gap-1"
                            >
                              <Plus className="w-4 h-4" />
                              Add
                            </button>
                          )}
                        </DropCell>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <UnscheduledTray
          unscheduled={unscheduled}
          recipesById={recipesById}
          onAssign={(slot) => setPicker({ type: "unscheduled", slot })}
          onMarkCooked={(slot) => void openLeftoversThen(slot, true)}
          onRemove={(slot) =>
            void removeSlot(slot.id).then(
              () => toast.success("Removed from this week"),
              () => toast.error("Could not remove meal")
            )
          }
        />
      </DndContext>

      {weekSlots.length === 0 && (
        <div className="text-center p-10 mt-6 bg-white rounded-xl border border-dashed border-gray-300">
          <Utensils className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">
            No meals this week
          </h3>
          <p className="mt-1 text-gray-500">
            Add recipes from your collection to a day and meal slot.
          </p>
          <Link
            href="/collection"
            className="mt-6 inline-flex items-center px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 text-sm font-medium"
          >
            Browse Collection
          </Link>
        </div>
      )}

      {picker && (
        <AddToWeekModal
          weekStart={weekStart}
          recipes={
            picker.type === "cell"
              ? collectionRecipes
              : picker.type === "recipe"
                ? [picker.recipe]
                : recipesById.get(picker.slot.recipeId)
                  ? [recipesById.get(picker.slot.recipeId)!]
                  : collectionRecipes
          }
          initialRecipeId={
            picker.type === "recipe"
              ? picker.recipe.id
              : picker.type === "unscheduled"
                ? picker.slot.recipeId
                : undefined
          }
          initialDayOfWeek={
            picker.type === "cell"
              ? picker.dayOfWeek
              : picker.type === "recipe"
                ? picker.dayOfWeek ?? dinnerSuggestion.dayOfWeek
                : dinnerSuggestion.dayOfWeek
          }
          initialMealSlot={
            picker.type === "cell"
              ? picker.mealSlot
              : picker.type === "recipe"
                ? picker.mealSlot ?? dinnerSuggestion.mealSlot
                : dinnerSuggestion.mealSlot
          }
          occupiedKeys={occupiedKeys}
          onClose={() => setPicker(null)}
          onConfirm={async ({ recipeId, dayOfWeek, mealSlot }) => {
            if (picker.type === "unscheduled") {
              await moveSlot(picker.slot.id, {
                weekStart,
                dayOfWeek,
                mealSlot,
              });
              toast.success("Assigned to the week");
              return;
            }
            const recipe =
              picker.type === "recipe"
                ? picker.recipe
                : collectionRecipes.find((item) => item.id === recipeId);
            if (!recipe) throw new Error("Recipe not found");
            await addToSlot(recipe, {
              weekStart,
              dayOfWeek,
              mealSlot,
              servingsOverride: recipe.servings,
            });
            toast.success("Added to your weekly plan");
          }}
        />
      )}

      {leftoversSlot && recipesById.get(leftoversSlot.recipeId) && (
        <LeftoversModal
          recipe={recipesById.get(leftoversSlot.recipeId)!}
          scale={
            leftoversSlot.servingsOverride &&
            recipesById.get(leftoversSlot.recipeId)!.servings
              ? leftoversSlot.servingsOverride /
                recipesById.get(leftoversSlot.recipeId)!.servings
              : 1
          }
          onClose={closeLeftovers}
          onSave={saveLeftovers}
          onGenerate={generateFromLeftovers}
        />
      )}
    </>
  );
}
