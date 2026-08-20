import type { MealSlot } from "@/types";

const WEEKDAY_TO_MONDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedCalendarParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);

  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const weekday = values.weekday;
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !weekday
  ) {
    throw new Error("Could not resolve calendar date for timezone");
  }

  return { year, month, day, weekday };
}

function ymdToUtcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseYmd(ymd: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error(`Invalid date string: ${ymd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return ymdToUtcDate(year, month, day);
}

export function addDaysToYmd(ymd: string, days: number): string {
  const date = parseYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

export function getZonedYmd(date: Date, timeZone: string): string {
  const zoned = zonedCalendarParts(date, timeZone);
  return `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}`;
}

export function getWeekStart(date: Date, timeZone: string): string {
  const zoned = zonedCalendarParts(date, timeZone);
  const offset = WEEKDAY_TO_MONDAY_INDEX[zoned.weekday];
  if (offset === undefined) {
    throw new Error(`Unknown weekday: ${zoned.weekday}`);
  }
  const calendarUtc = ymdToUtcDate(zoned.year, zoned.month, zoned.day);
  calendarUtc.setUTCDate(calendarUtc.getUTCDate() - offset);
  return formatYmd(calendarUtc);
}

export function nextEmptyDinner(
  weekStart: string,
  occupiedKeys: Set<string>,
  todayYmd: string
): { dayOfWeek: number; mealSlot: MealSlot } {
  const start = parseYmd(weekStart);
  const today = parseYmd(todayYmd);
  const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  const startDay = Math.min(6, Math.max(0, diff));
  for (let offset = 0; offset < 7; offset += 1) {
    const dayOfWeek = (startDay + offset) % 7;
    if (!occupiedKeys.has(`${dayOfWeek}:dinner`)) {
      return { dayOfWeek, mealSlot: "dinner" };
    }
  }
  return { dayOfWeek: startDay, mealSlot: "dinner" };
}

export function shiftWeekStart(weekStart: string, weeks: number): string {
  return addDaysToYmd(weekStart, weeks * 7);
}

export function formatWeekRange(weekStart: string): string {
  const start = parseYmd(weekStart);
  const end = parseYmd(addDaysToYmd(weekStart, 6));
  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startLabel} – ${endLabel}`;
}

export function mealSlotLabel(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}
