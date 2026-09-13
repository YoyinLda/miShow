const SANTIAGO_TIME_ZONE = "America/Santiago";

export function instantKey(value: string): number | undefined {
  const date = parseInstant(value);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

export function toSantiago(value: string): string {
  const date = parseInstant(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Fecha inválida: ${value}`);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: SANTIAGO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset"
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => (acc[part.type] = part.value, acc), {});
  const offset = ((parts.timeZoneName ?? "GMT-04:00").replace("GMT", "").replace("−", "-")) || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function parseInstant(value: string): Date {
  const local = value.match(/^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?)?$/);
  if (local) return isValidCalendarParts(local) ? localDateInSantiago(local) : new Date(NaN);
  const isoDate = value.match(/^(\d{4})-(\d\d)-(\d\d)(?:[T ]|$)/);
  if (isoDate && !isValidCalendarParts(isoDate)) return new Date(NaN);
  const slashDate = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s|$)/);
  if (slashDate && !isValidCalendarParts(["", slashDate[3], slashDate[2], slashDate[1], "00", "00", "00"] as RegExpMatchArray)) return new Date(NaN);
  return new Date(value);
}

function localDateInSantiago(match: RegExpMatchArray): Date {
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const wallParts = {
    year: Number(year), month: Number(month), day: Number(day),
    hour: Number(hour), minute: Number(minute), second: Number(second)
  };
  const wallDate = new Date(Date.UTC(0, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  wallDate.setUTCFullYear(Number(year));
  const wall = wallDate.getTime();
  let instant = wallDate;
  for (let i = 0; i < 2; i++) instant = new Date(wall - offsetMinutes(instant) * 60_000);
  if (!matchesSantiagoWallTime(instant, wallParts)) return new Date(NaN);
  return instant;
}

function matchesSantiagoWallTime(date: Date, expected: Record<string, number>): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SANTIAGO_TIME_ZONE,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23"
  }).formatToParts(date).reduce<Record<string, number>>((result, part) => {
    if (part.type !== "literal") result[part.type] = Number(part.value);
    return result;
  }, {});
  return Object.entries(expected).every(([part, value]) => parts[part] === value);
}

function isValidCalendarParts(match: RegExpMatchArray): boolean {
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);
  const leapYear = yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthNumber - 1];
  if (!daysInMonth || dayNumber < 1 || dayNumber > daysInMonth) return false;
  return hourNumber >= 0 && hourNumber <= 23 && minuteNumber >= 0 && minuteNumber <= 59 && secondNumber >= 0 && secondNumber <= 59;
}

function offsetMinutes(date: Date): number {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: SANTIAGO_TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = offset.match(/GMT([+-])(\d\d?):?(\d\d)?/);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}
