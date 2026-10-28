"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import { followReducer, initialFollowState } from "@/lib/busyWeekFollow";
import type { BusyWeekPick, BusyWeekResponse, BusyWeekResult } from "@/types";

const POLL_MS = 2_000;
const STORAGE_PREFIX = "mise-busy-week:";

/** sessionStorage can throw in Safari Private mode. Losing it only loses the best-effort resume. */
function storedBatchId(weekStart: string): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + weekStart);
  } catch {
    return null;
  }
}

function storeBatchId(weekStart: string, batchId: string | null) {
  try {
    if (batchId) {
      window.sessionStorage.setItem(STORAGE_PREFIX + weekStart, batchId);
    } else {
      window.sessionStorage.removeItem(STORAGE_PREFIX + weekStart);
    }
  } catch {
    // Storage unavailable: the in-memory batch id still works for this visit.
  }
}

/** Put the batch's recipes and placed dinners in the stores, so the plan shows them without Realtime. */
function applyResults(weekStart: string, results: BusyWeekResult[]) {
  const plan = useWeeklyPlanStore.getState();
  const recipes = useRecipesStore.getState();
  for (const result of results) {
    if (result.recipe) {
      const known = recipes.recipes.some((item) => item.id === result.recipe!.id);
      if (!known) recipes.addRecipe(result.recipe);
    }
    const slot = result.planSlot;
    if (!slot || slot.dayOfWeek === null) continue;
    if (result.status === "replaced") {
      // The old dinner was removed on the server. Drop it from the store too.
      for (const existing of plan.slots) {
        if (
          existing.id !== slot.id &&
          existing.weekStart === weekStart &&
          existing.dayOfWeek === slot.dayOfWeek &&
          existing.mealSlot === "dinner"
        ) {
          plan.removeSlot(existing.id);
        }
      }
    }
    plan.upsertSlot(slot);
  }
}

export type BusyWeekPhase = "idle" | "running" | "done";

/**
 * Runs one busy-week batch for the week on screen. The POST gives the final answer.
 * Polling GET /api/busy-week/[batchId] shows progress and recovers the batch after a
 * dropped request, a locked phone or a backgrounded tab (iOS). Which responses count
 * is decided by followReducer: only the active batch's.
 */
export function useBusyWeek(weekStart: string) {
  const [state, dispatch] = useReducer(followReducer, initialFollowState);

  // The active batch id, readable synchronously by in-flight requests and effects.
  const batchIdRef = useRef<string | null>(null);
  const weekRef = useRef(weekStart);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    weekRef.current = weekStart;
  }, [weekStart]);

  useEffect(() => {
    batchIdRef.current = state.batchId;
  }, [state.batchId]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /** Reads the server's copy of one batch. Only the active batch's answer is applied. */
  const refresh = useCallback(async (batchId: string) => {
    try {
      const response = await fetch(`/api/busy-week/${batchId}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (response.status === 404) {
        dispatch({ type: "missing", batchId, now: Date.now() });
        return;
      }
      if (!response.ok) return;

      const data = (await response.json()) as BusyWeekResponse;
      if (batchIdRef.current !== batchId) return;
      applyResults(weekRef.current, data.results);
      dispatch({ type: "response", batchId, data });
    } catch {
      // A dropped read is retried on the next tick.
    }
  }, []);

  const startPolling = useCallback(
    (batchId: string) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        void refresh(batchId);
      }, POLL_MS);
    },
    [refresh, stopPolling]
  );

  const submit = useCallback(
    async (picks: BusyWeekPick[]) => {
      // A second tap while a batch runs must not start another one (and reserve again).
      if (batchIdRef.current) return;

      const batchId = crypto.randomUUID();
      batchIdRef.current = batchId;
      storeBatchId(weekRef.current, batchId);
      dispatch({ type: "start", batchId, now: Date.now() });
      startPolling(batchId);

      let response: Response;
      try {
        response = await fetch("/api/busy-week", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId, weekStart: weekRef.current, picks }),
        });
      } catch {
        // The request may never have reached the server. Polling decides: if the server
        // never learns of this batch, the sheet gives up and offers a retry.
        return;
      }

      // 409: the batch already exists, so keep following it. 5xx: the server may still
      // finish the batch, and the polling settles it, so keep following it too.
      if (response.status === 409 || response.status >= 500) return;

      const body = (await response.json().catch(() => ({}))) as BusyWeekResponse | { error?: string };
      if (!response.ok) {
        dispatch({
          type: "failed",
          batchId,
          message: ("error" in body && body.error) || "Chef's Week could not start.",
        });
        return;
      }

      if (batchIdRef.current !== batchId) return;
      const data = body as BusyWeekResponse;
      applyResults(weekRef.current, data.results);
      dispatch({ type: "response", batchId, data });
    },
    [startPolling]
  );

  // Resume after a reload, from the best-effort stored id.
  useEffect(() => {
    const resumeId = batchIdRef.current ?? storedBatchId(weekStart);
    if (!resumeId) return;
    batchIdRef.current = resumeId;
    dispatch({ type: "start", batchId: resumeId, now: Date.now() });
    void refresh(resumeId);
    startPolling(resumeId);
    return () => stopPolling();
  }, [weekStart, refresh, startPolling, stopPolling]);

  // iOS pauses backgrounded tabs and can drop the in-flight fetch. Catch up when the page is visible again.
  useEffect(() => {
    const onVisible = () => {
      const batchId = batchIdRef.current;
      if (document.visibilityState === "visible" && batchId) {
        startPolling(batchId);
        void refresh(batchId);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, startPolling]);

  // Polling runs only while a batch is running. When the run ends, the stored id is cleared.
  useEffect(() => {
    if (state.phase === "running") {
      wasRunning.current = true;
      return;
    }
    stopPolling();
    if (wasRunning.current) {
      wasRunning.current = false;
      storeBatchId(weekRef.current, null);
    }
  }, [state.phase, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  return { phase: state.phase, batch: state.batch, error: state.error, submit };
}
