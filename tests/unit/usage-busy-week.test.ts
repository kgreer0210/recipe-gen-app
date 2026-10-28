import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import {
  getUsageErrorMessage,
  releaseUsage,
  reserveUsage,
} from "@/lib/usage";

const plusUser = { id: "user-plus" } as Parameters<typeof reserveUsage>[1];
const adminUser = { id: "admin-1" } as Parameters<typeof reserveUsage>[1];

describe("reserveUsage", () => {
  beforeEach(() => {
    rpc.mockReset();
    process.env.ADMIN_USER_ID = "admin-1";
  });

  afterEach(() => {
    delete process.env.ADMIN_USER_ID;
  });

  it("reserves the whole batch through reserve_usage and maps the result", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        allowed: true,
        plan_key: "plus",
        reserved: 3,
        week_count: 6,
        week_limit_hard: 100,
        week_limit_soft: null,
        remaining: 94,
        window_start: "2026-10-26T04:00:00+00:00",
        reset_at: "2026-11-02T05:00:00+00:00",
        soft_limited: false,
      },
      error: null,
    });

    const result = await reserveUsage("generate", plusUser, 3);

    expect(rpc).toHaveBeenCalledWith("reserve_usage", {
      p_user_id: "user-plus",
      p_action: "generate",
      p_count: 3,
    });
    expect(result).toMatchObject({
      allowed: true,
      planKey: "plus",
      remaining: 94,
      windowStart: "2026-10-26T04:00:00+00:00",
    });
  });

  it("returns the reason and what is left when the batch does not fit", async () => {
    rpc.mockResolvedValueOnce({
      data: { allowed: false, reason: "insufficient_remaining", plan_key: "plus", remaining: 2 },
      error: null,
    });

    const result = await reserveUsage("generate", plusUser, 3);

    expect(result).toMatchObject({ allowed: false, reason: "insufficient_remaining", remaining: 2 });
  });

  it("fails closed when the RPC errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const result = await reserveUsage("generate", plusUser, 3);

    expect(result).toMatchObject({ allowed: false, reason: "rpc_error" });
  });

  it("lets the admin through without calling the database", async () => {
    const result = await reserveUsage("generate", adminUser, 7);

    expect(rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ allowed: true, planKey: "admin", remaining: null, windowStart: null });
  });
});

describe("releaseUsage", () => {
  beforeEach(() => {
    rpc.mockReset();
    process.env.ADMIN_USER_ID = "admin-1";
  });

  afterEach(() => {
    delete process.env.ADMIN_USER_ID;
  });

  it("releases into the reserved week, not the current one", async () => {
    rpc.mockResolvedValueOnce({ data: { released: 2 }, error: null });

    await releaseUsage("generate", plusUser, 2, "2026-10-26T04:00:00+00:00");

    expect(rpc).toHaveBeenCalledWith("release_usage", {
      p_user_id: "user-plus",
      p_action: "generate",
      p_count: 2,
      p_window_start: "2026-10-26T04:00:00+00:00",
    });
  });

  it("does nothing for the admin, who was never counted", async () => {
    await releaseUsage("generate", adminUser, 2, null);

    expect(rpc).not.toHaveBeenCalled();
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
    expect(getUsageErrorMessage("save_limit", "plus")).toMatch(/saved recipes/i);
  });
});
