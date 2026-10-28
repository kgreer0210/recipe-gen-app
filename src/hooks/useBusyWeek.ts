"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import { useRecipesStore } from "@/lib/stores/recipesStore";
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
 * Runs one busy-week batch for the week on screen. The POST gives the final
 * answer. Polling GET /api/busy-week/[batchId] shows progress and recovers the
 * batch after a dropped request, a locked phone or a backgrounded tab (iOS).
 */
export function useBusyWeek(weekStart: string) {
  const [phase, setPhase] = useState<BusyWeekPhase>("idle");
  const [batch, setBatch] = useState<BusyWeekResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const batchIdRef = useRef<string | null>(null);
  const weekRef = useRef(weekStart);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    weekRef.current = weekStart;
  }, [weekStart]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /** Reads the server's copy of the batch, applies it to the plan, and stops when it is no longer running. */
  const refresh = useCallback(
    async (batchId: string): Promise<BusyWeekResponse | null> => {
      try {
        const response = await fetch(`/api/busy-week/${batchId}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return null;
        const data = (await response.json()) as BusyWeekResponse;
        setBatch(data);
        applyResults(weekRef.current, data.results);
        if (data.status !== "running") {
          stopPolling();
          setPhase("done");
          batchIdRef.current = null;
          storeBatchId(weekRef.current, null);
        }
        return data;
      } catch {
        // A failed poll is retried on the next tick.
        return null;
      }
    },
    [stopPolling]
  );

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
      setPhase("running");
      setError(null);
      setBatch(null);
      startPolling(batchId);

      try {
        const response = await fetch("/api/busy-week", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId, weekStart: weekRef.current, picks }),
        });
        const body = (await response.json().catch(() => ({}))) as
          | BusyWeekResponse
          | { error?: string };

        if (response.status === 409) {
          // The batch already exists (a retry of an earlier request). Keep following it.
          return;
        }
        if (!response.ok) {
          stopPolling();
          batchIdRef.current = null;
          storeBatchId(weekRef.current, null);
          setPhase("idle");
          setError(("error" in body && body.error) || "Busy week could not start.");
          return;
        }

        const data = body as BusyWeekResponse;
        stopPolling();
        setBatch(data);
        applyResults(weekRef.current, data.results);
        setPhase("done");
        batchIdRef.current = null;
        storeBatchId(weekRef.current, null);
      } catch {
        // The connection dropped (for example the phone locked). The server keeps
        // going, so keep polling for the batch instead of posting it again.
        await refresh(batchId);
      }
    },
    [refresh, startPolling, stopPolling]
  );

  // Resume after a reload, or when the week changes, from the best-effort stored id.
  useEffect(() => {
    const resumeId = batchIdRef.current ?? storedBatchId(weekStart);
    if (!resumeId) return;
    batchIdRef.current = resumeId;
    setPhase("running");
    void refresh(resumeId).then((data) => {
      if (data && data.status === "running") startPolling(resumeId);
      if (!data) {
        batchIdRef.current = null;
        setPhase("idle");
      }
    });
    return () => stopPolling();
  }, [weekStart, refresh, startPolling, stopPolling]);

  // iOS pauses backgrounded tabs and can drop the in-flight fetch. Catch up when the page is visible again.
  useEffect(() => {
    const onVisible = () => {
      const batchId = batchIdRef.current;
      if (document.visibilityState === "visible" && batchId) {
        void refresh(batchId).then((data) => {
          if (data?.status === "running") startPolling(batchId);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, startPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const reset = useCallback(() => {
    if (batchIdRef.current) return;
    setPhase("idle");
    setBatch(null);
    setError(null);
  }, []);

  return { phase, batch, error, submit, reset };
}
