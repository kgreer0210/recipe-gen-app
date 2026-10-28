import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import {
  beginBusyWeekBatch,
  getUsageErrorMessage,
  settleBusyWeekBatch,
} from "@/lib/usage";

const plusUser = { id: "user-plus" } as Parameters<typeof beginBusyWeekBatch>[0]["user"];
const adminUser = { id: "admin-1" } as Parameters<typeof beginBusyWeekBatch>[0]["user"];
const BATCH = "3f0c9c2e-6a1e-4c7e-9a55-1f2b3c4d5e6f";
const RESULTS = [{ index: 0, status: "pending" }];

function begin(user: typeof plusUser, count = 3) {
  return beginBusyWeekBatch({ batchId: BATCH, user, weekStart: "2026-10-26", count, results: RESULTS });
}

describe("beginBusyWeekBatch", () => {
  beforeEach(() => {
    rpc.mockReset();
    process.env.ADMIN_USER_ID = "admin-1";
  });

  afterEach(() => {
    delete process.env.ADMIN_USER_ID;
  });

  it("records the batch and reserves the whole batch in one database call", async () => {
    rpc.mockResolvedValueOnce({
      data: { outcome: "started", plan_key: "plus", window_start: "2026-10-26T04:00:00+00:00", remaining: 94 },
      error: null,
    });

    const result = await begin(plusUser);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("begin_busy_week_batch", {
      p_batch_id: BATCH,
      p_user_id: "user-plus",
      p_week_start: "2026-10-26",
      p_count: 3,
      p_results: RESULTS,
      p_charge: true,
    });
    expect(result).toEqual({
      outcome: "started",
      planKey: "plus",
      windowStart: "2026-10-26T04:00:00+00:00",
      remaining: 94,
    });
  });

  it("reports a batch id that already exists, so the caller can answer 409", async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: "duplicate" }, error: null });

    expect(await begin(plusUser)).toEqual({ outcome: "duplicate" });
  });

  it("reports a block with its reason and what is left", async () => {
    rpc.mockResolvedValueOnce({
      data: { outcome: "blocked", reason: "insufficient_remaining", plan_key: "plus", remaining: 2 },
      error: null,
    });

    expect(await begin(plusUser)).toEqual({
      outcome: "blocked",
      reason: "insufficient_remaining",
      planKey: "plus",
      remaining: 2,
    });
  });

  it("fails closed when the RPC errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    expect(await begin(plusUser)).toMatchObject({ outcome: "error" });
  });

  it("records the admin's batch without charging the weekly count", async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: "started", plan_key: "admin", window_start: null, remaining: null }, error: null });

    const result = await begin(adminUser, 7);

    expect(rpc).toHaveBeenCalledWith("begin_busy_week_batch", expect.objectContaining({ p_charge: false, p_count: 7 }));
    expect(result).toMatchObject({ outcome: "started", windowStart: null, remaining: null });
  });
});

describe("settleBusyWeekBatch", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("asks the database to refund and finish the batch, interrupting pending picks only when told to", async () => {
    rpc.mockResolvedValueOnce({
      data: { settled: true, status: "partial", refunded: 2, refunded_now: 2 },
      error: null,
    });

    const result = await settleBusyWeekBatch(BATCH, true);

    expect(rpc).toHaveBeenCalledWith("settle_busy_week_batch", { p_batch_id: BATCH, p_interrupt_pending: true });
    expect(result).toEqual({ ok: true, settled: true, status: "partial", refunded: 2 });
  });

  it("reports a batch that was already finished, so a second call changes nothing", async () => {
    rpc.mockResolvedValueOnce({ data: { settled: false, reason: "already_settled", status: "completed", refunded: 0 }, error: null });

    expect(await settleBusyWeekBatch(BATCH, false)).toEqual({
      ok: true,
      settled: false,
      reason: "already_settled",
      status: "completed",
      refunded: 0,
    });
  });

  it("reports a failed refund as an error, so the batch is not treated as finished", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "release failed" } });

    const result = await settleBusyWeekBatch(BATCH, false);

    expect(result).toEqual({ ok: false, error: "release failed" });
  });
});

describe("getUsageErrorMessage for busy week", () => {
  it("explains that Busy week is a paid feature", () => {
    expect(getUsageErrorMessage("paid_plan_required", "free")).toMatch(/Plus or Pro/);
  });

  it("says how many recipes are left when the batch does not fit", () => {
    expect(getUsageErrorMessage("insufficient_remaining", "plus", 2)).toMatch(/2 left/);
  });

  it("explains a full save library", () => {
    expect(getUsageErrorMessage("save_limit", "plus")).toMatch(/saved recipes are full/);
  });
});
