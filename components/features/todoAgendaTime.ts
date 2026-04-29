"use client";

export const DAY_COUNT = 7;
export const DAY_MS = 86400000;
export const DHAKA_TIMEZONE = "Asia/Dhaka";
export const TODO_DURATION_OPTIONS = Array.from(
  { length: 16 },
  (_, index) => (index + 1) * 15,
);

export function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

export function formatMonthLabel(date: number) {
  return new Intl.DateTimeFormat("bn-BD", {
    month: "long",
    year: "numeric",
    timeZone: DHAKA_TIMEZONE,
  }).format(date);
}

export function formatDayNumber(date: number) {
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    timeZone: DHAKA_TIMEZONE,
  }).format(date);
}

export function formatShortWeekday(date: number) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: DHAKA_TIMEZONE,
  }).format(date);
}

export function formatLongWeekday(date: number) {
  return new Intl.DateTimeFormat("bn-BD", {
    weekday: "long",
    timeZone: DHAKA_TIMEZONE,
  }).format(date);
}

export function formatDayMonth(date: number) {
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    timeZone: DHAKA_TIMEZONE,
  }).format(date);
}

export function buildDayHeading(date: number, today: number) {
  const parts = [formatDayMonth(date)];

  if (date === today) {
    parts.push("আজ");
  } else if (date === today + DAY_MS) {
    parts.push("আগামীকাল");
  }

  parts.push(formatLongWeekday(date));
  return parts.join(" · ");
}

export function roundToNearestDuration(minutes: number) {
  let nearest = TODO_DURATION_OPTIONS[0];
  let nearestDifference = Math.abs(minutes - nearest);

  for (const option of TODO_DURATION_OPTIONS) {
    const difference = Math.abs(minutes - option);
    if (
      difference < nearestDifference ||
      (difference === nearestDifference && option > nearest)
    ) {
      nearest = option;
      nearestDifference = difference;
    }
  }

  return nearest;
}

export function roundToNearestQuarterHour(totalMinutes: number) {
  const roundedMinutes = Math.round(totalMinutes / 15) * 15;
  return ((roundedMinutes % 1440) + 1440) % 1440;
}

export function formatDurationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${minutes} মিনিট`;
  }

  if (remainingMinutes === 0) {
    return `${hours} ঘণ্টা`;
  }

  return `${hours} ঘণ্টা ${remainingMinutes} মিনিট`;
}

function createUtcTimeDate(totalMinutes: number) {
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return new Date(Date.UTC(2000, 0, 1, hours, minutes));
}

export function formatClockTime(totalMinutes: number) {
  return new Intl.DateTimeFormat("bn-BD", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(createUtcTimeDate(totalMinutes));
}

export function formatTimeRangeLabel(
  startTimeMinutes: number,
  durationMinutes: number,
) {
  return `${formatClockTime(startTimeMinutes)} - ${formatClockTime(
    startTimeMinutes + durationMinutes,
  )}`;
}

export function parseTimeInputValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    value.length === 0 ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

export function formatTimeInputValue(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
