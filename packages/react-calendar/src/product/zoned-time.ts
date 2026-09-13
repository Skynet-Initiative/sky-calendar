interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(instant: Date, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  function numberPart(type: Intl.DateTimeFormatPartTypes): number {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) throw new RangeError(`Missing ${type} date part`);
    return Number(value);
  }
  return {
    year: numberPart("year"),
    month: numberPart("month"),
    day: numberPart("day"),
    hour: numberPart("hour"),
    minute: numberPart("minute"),
    second: numberPart("second"),
  };
}

function wallEpoch(parts: WallParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

export function wallDateFromInstant(instant: Date, timeZone: string): Date {
  return new Date(wallEpoch(wallParts(instant, timeZone)));
}

export function instantFromWallDate(wallDate: Date, timeZone: string): Date {
  const expected: WallParts = {
    year: wallDate.getUTCFullYear(),
    month: wallDate.getUTCMonth() + 1,
    day: wallDate.getUTCDate(),
    hour: wallDate.getUTCHours(),
    minute: wallDate.getUTCMinutes(),
    second: wallDate.getUTCSeconds(),
  };
  const target = wallEpoch(expected);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset =
      wallEpoch(wallParts(new Date(candidate), timeZone)) - candidate;
    candidate = target - offset;
  }
  const result = new Date(candidate);
  const actual = wallParts(result, timeZone);
  if (wallEpoch(actual) !== target) {
    throw new RangeError(
      "The selected local time does not exist in this time zone",
    );
  }
  return result;
}

export function localInputFromInstant(instant: Date, timeZone: string): string {
  return localInputFromWallDate(wallDateFromInstant(instant, timeZone));
}

export function localInputFromWallDate(wallDate: Date): string {
  return `${dateKey(wallDate)}T${String(wallDate.getUTCHours()).padStart(2, "0")}:${String(wallDate.getUTCMinutes()).padStart(2, "0")}`;
}

export function instantFromLocalInput(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Invalid local date and time");
  return instantFromWallDate(
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
      ),
    ),
    timeZone,
  );
}

export function dateKey(wallDate: Date): string {
  return `${wallDate.getUTCFullYear()}-${String(wallDate.getUTCMonth() + 1).padStart(2, "0")}-${String(wallDate.getUTCDate()).padStart(2, "0")}`;
}
