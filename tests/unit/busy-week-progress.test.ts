import { describe, expect, it } from "vitest";
import { progressRows } from "@/lib/busyWeek";
import type { BusyWeekPick, BusyWeekResult } from "@/types";

const picks: BusyWeekPick[] = [
  { cuisine: "Thai", mealStyle: "Taco", protein: "Shrimp/Seafood", dayOfWeek: 2 },
  { cuisine: "Mexican", mealStyle: "Any", dayOfWeek: 4 },
  { cuisine: "Thai", mealStyle: "Any", dayOfWeek: 6 },
];

describe("busy week progress rows", () => {
  it("shows one queued row per submitted pick, in submit order, before the server answers", () => {
    const rows = progressRows(picks, []);

    expect(rows).toEqual([
      { index: 0, cuisine: "Thai", mealStyle: "Taco", protein: "Shrimp/Seafood", dayOfWeek: 2, status: "pending" },
      { index: 1, cuisine: "Mexican", mealStyle: "Any", protein: "Any", dayOfWeek: 4, status: "pending" },
      { index: 2, cuisine: "Thai", mealStyle: "Any", protein: "Any", dayOfWeek: 6, status: "pending" },
    ]);
  });

  it("defaults a pick without a meal style or protein to Any, as the form does", () => {
    const rows = progressRows([{ cuisine: "Thai", dayOfWeek: 1 }], []);

    expect(rows[0]).toMatchObject({ mealStyle: "Any", protein: "Any" });
  });

  it("replaces a queued row with the server result that has the same index, and keeps the rest queued", () => {
    const serverPlaced: BusyWeekResult = {
      index: 1,
      cuisine: "Mexican",
      mealStyle: "Any",
      protein: "Any",
      dayOfWeek: 4,
      status: "placed",
      recipe: { id: "r1", title: "Tacos" } as BusyWeekResult["recipe"],
    };

    const rows = progressRows(picks, [serverPlaced]);

    expect(rows.map((row) => row.status)).toEqual(["pending", "placed", "pending"]);
    expect(rows[1]).toBe(serverPlaced);
  });

  it("matches by index, not by array position, when server results arrive out of order", () => {
    const failedLast: BusyWeekResult = {
      index: 2,
      cuisine: "Thai",
      mealStyle: "Any",
      protein: "Any",
      dayOfWeek: 6,
      status: "failed",
      error: "generation_failed",
    };

    const rows = progressRows(picks, [failedLast]);

    expect(rows.map((row) => row.index)).toEqual([0, 1, 2]);
    expect(rows[2]).toBe(failedLast);
  });

  it("returns the server's results unchanged for a resumed batch with no submitted picks", () => {
    const resumed: BusyWeekResult[] = [
      { index: 0, cuisine: "Thai", mealStyle: "Any", protein: "Any", dayOfWeek: 0, status: "pending" },
    ];

    expect(progressRows(null, resumed)).toBe(resumed);
  });
});
