import type { BusyWeekResponse } from "@/types";

/**
 * How long the server may not know a batch id before we conclude its first request
 * never arrived. A request that did arrive creates its row within moments, so after
 * this the sheet stops waiting and offers a retry (with a new batch id).
 */
export const NOT_FOUND_GIVE_UP_MS = 15_000;

export const NOT_STARTED_MESSAGE =
  "Chef's Week didn't start. Check your connection, then tap Generate to try again.";

export type FollowState = {
  /** The one batch the sheet is following. Responses for any other id are ignored. */
  batchId: string | null;
  phase: "idle" | "running" | "done";
  batch: BusyWeekResponse | null;
  error: string | null;
  startedAt: number;
  /** The server has answered for this batch at least once. */
  seen: boolean;
};

export const initialFollowState: FollowState = {
  batchId: null,
  phase: "idle",
  batch: null,
  error: null,
  startedAt: 0,
  seen: false,
};

export type FollowAction =
  | { type: "start"; batchId: string; now: number }
  | { type: "response"; batchId: string; data: BusyWeekResponse }
  | { type: "missing"; batchId: string; now: number }
  | { type: "failed"; batchId: string; message: string };

/**
 * State for one busy-week run on the sheet. Every action names the batch it is about,
 * and anything about a batch other than the active one is dropped. That covers a POST
 * or GET that resolves after the user has retried, since its batch id is no longer active.
 */
export function followReducer(state: FollowState, action: FollowAction): FollowState {
  switch (action.type) {
    case "start":
      return {
        batchId: action.batchId,
        phase: "running",
        batch: null,
        error: null,
        startedAt: action.now,
        seen: false,
      };

    case "response": {
      if (action.batchId !== state.batchId) return state;
      const finished = action.data.status !== "running";
      return {
        ...state,
        batch: action.data,
        seen: true,
        phase: finished ? "done" : "running",
        batchId: finished ? null : state.batchId,
        error: null,
      };
    }

    case "missing": {
      if (action.batchId !== state.batchId || state.seen) return state;
      if (action.now - state.startedAt < NOT_FOUND_GIVE_UP_MS) return state;
      return { ...initialFollowState, error: NOT_STARTED_MESSAGE };
    }

    case "failed": {
      if (action.batchId !== state.batchId) return state;
      return { ...initialFollowState, error: action.message };
    }
  }
}
