import { create } from "zustand";
import type { WeeklyPlanSlot } from "@/types";

interface WeeklyPlanState {
  slots: WeeklyPlanSlot[];
  loading: boolean;
  error: Error | null;
  setSlots: (slots: WeeklyPlanSlot[]) => void;
  upsertSlot: (slot: WeeklyPlanSlot) => void;
  removeSlot: (slotId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}

export const useWeeklyPlanStore = create<WeeklyPlanState>((set) => ({
  slots: [],
  loading: false,
  error: null,
  setSlots: (slots) => set({ slots }),
  upsertSlot: (slot) =>
    set((state) => {
      const index = state.slots.findIndex((item) => item.id === slot.id);
      if (index === -1) {
        return { slots: [slot, ...state.slots] };
      }
      const next = [...state.slots];
      next[index] = slot;
      return { slots: next };
    }),
  removeSlot: (slotId) =>
    set((state) => ({
      slots: state.slots.filter((slot) => slot.id !== slotId),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));

export function weeklyPlanGrocerySignature(slots: WeeklyPlanSlot[]): string {
  return slots
    .filter((slot) => !slot.cookedAt)
    .map(
      (slot) =>
        `${slot.id}:${slot.recipeId}:${slot.servingsOverride ?? ""}:${slot.dayOfWeek ?? ""}:${slot.mealSlot ?? ""}`
    )
    .sort()
    .join("|");
}

export function planGrocerySignatureKey(
  userId: string,
  weekStart: string
): string {
  return `mise-plan-grocery-sig:${userId}:${weekStart}`;
}
