import { describe, expect, it } from "vitest";
import {
  NOT_FOUND_GIVE_UP_MS,
  followReducer,
  initialFollowState,
  type FollowState,
} from "@/lib/busyWeekFollow";
import type { BusyWeekResponse } from "@/types";

const FIRST = "3f0c9c2e-6a1e-4c7e-9a55-1f2b3c4d5e6f";
const RETRY = "8a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d";
const T0 = 1_000_000;

function batch(batchId: string, status: BusyWeekResponse["status"]): BusyWeekResponse {
  return { batchId, status, usage: { reserved: 1, refunded: 0, remaining: 10 }, results: [] };
}

function started(state: FollowState, batchId: string, now: number) {
  return followReducer(state, { type: "start", batchId, now });
}

describe("busy week follow state", () => {
  it("ignores a response for an earlier batch once a retry has started", () => {
    let state = started(initialFollowState, FIRST, T0);
    state = started(state, RETRY, T0 + 20_000);

    const next = followReducer(state, { type: "response", batchId: FIRST, data: batch(FIRST, "completed") });

    expect(next).toBe(state);
    expect(next).toMatchObject({ batchId: RETRY, phase: "running", batch: null });
  });

  it("ignores a failed start for an earlier batch", () => {
    let state = started(initialFollowState, FIRST, T0);
    state = started(state, RETRY, T0 + 20_000);

    const next = followReducer(state, { type: "failed", batchId: FIRST, message: "Too many" });

    expect(next).toBe(state);
    expect(next).toMatchObject({ batchId: RETRY, phase: "running", error: null });
  });

  it("finishes the run and frees the batch id when the active batch completes", () => {
    const state = started(initialFollowState, RETRY, T0);

    const next = followReducer(state, { type: "response", batchId: RETRY, data: batch(RETRY, "completed") });

    expect(next).toMatchObject({ phase: "done", batchId: null, error: null });
    expect(next.batch?.status).toBe("completed");
  });

  it("keeps the run going while the server reports the batch as running", () => {
    const state = started(initialFollowState, RETRY, T0);

    const next = followReducer(state, { type: "response", batchId: RETRY, data: batch(RETRY, "running") });

    expect(next).toMatchObject({ phase: "running", batchId: RETRY });
  });

  it("gives up when the server has never seen the batch, with a retryable error and no batch id", () => {
    let state = started(initialFollowState, FIRST, T0);

    state = followReducer(state, { type: "missing", batchId: FIRST, now: T0 + NOT_FOUND_GIVE_UP_MS - 1 });
    expect(state).toMatchObject({ phase: "running", batchId: FIRST });

    state = followReducer(state, { type: "missing", batchId: FIRST, now: T0 + NOT_FOUND_GIVE_UP_MS });
    expect(state).toMatchObject({ phase: "idle", batchId: null, batch: null });
    expect(state.error).toMatch(/didn't start/);

    // The retry is a new batch id, with the same picks left in the sheet.
    const retried = started(state, RETRY, T0 + NOT_FOUND_GIVE_UP_MS + 1_000);
    expect(retried).toMatchObject({ phase: "running", batchId: RETRY, error: null });
  });

  it("does not give up on a batch the server has already shown", () => {
    let state = started(initialFollowState, FIRST, T0);
    state = followReducer(state, { type: "response", batchId: FIRST, data: batch(FIRST, "running") });

    const next = followReducer(state, { type: "missing", batchId: FIRST, now: T0 + 10 * NOT_FOUND_GIVE_UP_MS });

    expect(next).toMatchObject({ phase: "running", batchId: FIRST });
  });

  it("ends the run with the server's message when a start is refused", () => {
    const state = started(initialFollowState, RETRY, T0);

    const next = followReducer(state, { type: "failed", batchId: RETRY, message: "You need a Plus plan." });

    expect(next).toMatchObject({ phase: "idle", batchId: null, error: "You need a Plus plan." });
  });

  it("ignores a missing report for an earlier batch", () => {
    let state = started(initialFollowState, FIRST, T0);
    state = started(state, RETRY, T0 + 20_000);

    const next = followReducer(state, { type: "missing", batchId: FIRST, now: T0 + 60_000 });

    expect(next).toBe(state);
  });
});
