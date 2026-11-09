// Calendar calculations for revision reminder delivery in Asia/Dhaka.
export const DAY_MS = 86_400_000;
export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

export function dhakaDay(timestamp: number): number {
  return Math.floor((timestamp + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS;
}

export function nextReminderTime(now: number, minutes: number): number {
  const today = dhakaDay(now) + minutes * 60_000;
  return today > now ? today : today + DAY_MS;
}

export function validateReminderTimes(firstMinutes: number, secondMinutes: number): void {
  if (!Number.isInteger(firstMinutes) || firstMinutes < 0 || firstMinutes >= 1440 ||
      !Number.isInteger(secondMinutes) || secondMinutes < 0 || secondMinutes >= 1440) {
    throw new Error("Choose valid reminder times between 00:00 and 23:59.");
  }
}
