import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn with tailwind-merge 3.7.1", () => {
  it("keeps an earlier leading class when a font size has no line-height modifier", () => {
    // Tailwind v4 keeps leading-* after a font size that has no line-height.
    expect(cn("leading-6", "text-lg")).toBe("leading-6 text-lg");
    expect(cn("leading-relaxed", "text-[1.5rem]")).toBe("leading-relaxed text-[1.5rem]");
  });

  it("lets a font size with a line-height modifier replace an earlier leading class", () => {
    expect(cn("leading-6", "text-lg/7")).toBe("text-lg/7");
  });

  it("lets sr-only replace the utilities that class resets", () => {
    expect(
      cn("absolute w-4 h-4 overflow-hidden whitespace-nowrap p-4", "sr-only")
    ).toBe("sr-only");
  });

  it("keeps the Chef's Week sheet overrides on the shared modal panel", () => {
    expect(
      cn(
        "w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto",
        "flex max-w-lg flex-col overflow-hidden overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--market-ink)] bg-[var(--market-surface)]"
      )
    ).toBe(
      "w-full rounded-2xl p-6 shadow-xl max-h-[min(90dvh,calc(100dvh-2rem))] flex max-w-lg flex-col overflow-hidden overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--market-ink)] bg-[var(--market-surface)]"
    );
  });
});
