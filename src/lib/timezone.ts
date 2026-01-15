/**
 * Detect the user's timezone based on their browser settings
 */
export function detectUserTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone || "UTC";
  } catch (error) {
    console.warn("Failed to detect timezone, defaulting to UTC", error);
    return "UTC";
  }
}

/**
 * Save user's timezone to the server
 */
export async function saveUserTimezone(timezone: string): Promise<void> {
  try {
    const response = await fetch("/api/user/settings/timezone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timezone }),
    });

    if (!response.ok) {
      throw new Error("Failed to save timezone");
    }
  } catch (error) {
    console.error("Error saving timezone:", error);
    // Don't throw - this is non-critical
  }
}

/**
 * Fetch user's saved timezone from the server
 */
export async function fetchUserTimezone(): Promise<string> {
  try {
    const response = await fetch("/api/user/settings/timezone", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return "UTC";
    }

    const data = await response.json();
    return data.timezone || "UTC";
  } catch (error) {
    console.error("Error fetching timezone:", error);
    return "UTC";
  }
}

/**
 * List of common IANA timezones
 */
export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Africa/Cairo",
  "Africa/Johannesburg",
];
