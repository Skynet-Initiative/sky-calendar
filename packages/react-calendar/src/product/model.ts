import type { DateAdapter } from "../core/date-adapter/date-adapter";
import type { ZonedDateTime } from "../core/date-adapter/zoned-date-time";
import type { CalendarEvent } from "../core/model/calendar-event";
import { sanitizeStatusKey } from "../theme/tokens";
import type {
  ProductAttendee,
  ProductCalendar,
  ProductConference,
  ProductEvent,
  ProductEventInput,
} from "./types";
import {
  dateKey,
  instantFromLocalInput,
  instantFromWallDate,
  localInputFromInstant,
  wallDateFromInstant,
} from "./zoned-time";

export const DAY_MS = 86_400_000;

/**
 * What the composer edits. Dates and times are local wall-clock strings
 * (`YYYY-MM-DDTHH:mm`) in the draft's zone, because that is what a person
 * types; the instant is derived at save time. An all-day draft carries its
 * INCLUSIVE last day, the way people think of "until Friday", while the model
 * stores an exclusive end.
 */
export interface SkyCalendarEventDraft {
  id: string | null;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  recurrenceRule: string;
  /** Comma-separated guest emails, the way the field is typed. */
  attendees: string;
  conference: ProductConference | null;
  status: ProductEvent["status"];
  visibility: ProductEvent["visibility"];
  timeZone: string;
  /** For an occurrence of a series: the occurrence's start instant. */
  occurrenceStart: string | null;
  scope: "occurrence" | "series";
}

export type SkyCalendarEventDraftField = Exclude<
  keyof SkyCalendarEventDraft,
  "id" | "occurrenceStart" | "timeZone"
>;

export interface SkyCalendarCalendarDraft {
  id: string | null;
  name: string;
  color: string;
}

export const DEFAULT_CALENDAR_COLOR = "#2563eb";
export const CALENDAR_COLORS: readonly string[] = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#475569",
];

/** The status key the views use to colour an event by its calendar. */
export function calendarStatusKey(calendarId: string): string {
  return sanitizeStatusKey(`cal-${calendarId}`);
}

export function statusColorsFor(
  calendars: readonly ProductCalendar[],
): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const calendar of calendars) {
    colors[calendarStatusKey(calendar.id)] = calendar.color;
  }
  return colors;
}

/**
 * The library's event model, carrying the product event as `meta`. Recurring
 * series stay series: the views expand them into occurrences themselves, and
 * every occurrence keeps the series in `meta` with its own `recurrenceId`.
 */
export function toCalendarEvent(
  event: ProductEvent,
  editable: boolean,
): CalendarEvent<ProductEvent> {
  return {
    id: event.id,
    start: new Date(event.start),
    end: new Date(event.end),
    allDay: event.allDay,
    timeZone: event.timeZone,
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    attendees: event.attendees.map((attendee) => attendee.email),
    visibility: event.visibility,
    status: calendarStatusKey(event.calendarId),
    ...(event.recurrenceRule ? { recurrenceRule: event.recurrenceRule } : {}),
    recurrenceExceptions: event.recurrenceExceptions.map(
      (value) => new Date(value),
    ),
    editable,
    meta: event,
  };
}

export function emptyDraft(input: {
  calendarId: string;
  start: Date;
  end: Date;
  allDay: boolean;
  timeZone: string;
}): SkyCalendarEventDraft {
  return {
    id: null,
    calendarId: input.calendarId,
    title: "",
    start: localInputFromInstant(input.start, input.timeZone),
    end: localInputFromInstant(
      input.allDay ? new Date(input.end.getTime() - DAY_MS) : input.end,
      input.timeZone,
    ),
    allDay: input.allDay,
    location: "",
    description: "",
    recurrenceRule: "",
    attendees: "",
    conference: null,
    status: "confirmed",
    visibility: "default",
    timeZone: input.timeZone,
    occurrenceStart: null,
    scope: "series",
  };
}

export function draftFromEvent(
  event: ProductEvent,
  occurrence: { start: Date; end: Date } | null,
): SkyCalendarEventDraft {
  const start = occurrence?.start ?? new Date(event.start);
  const end = occurrence?.end ?? new Date(event.end);
  return {
    id: event.id,
    calendarId: event.calendarId,
    title: event.title,
    start: localInputFromInstant(start, event.timeZone),
    end: localInputFromInstant(
      event.allDay ? new Date(end.getTime() - DAY_MS) : end,
      event.timeZone,
    ),
    allDay: event.allDay,
    location: event.location ?? "",
    description: event.description ?? "",
    recurrenceRule: event.recurrenceRule ?? "",
    attendees: event.attendees.map((attendee) => attendee.email).join(", "),
    conference: event.conference,
    status: event.status,
    visibility: event.visibility,
    timeZone: event.timeZone,
    occurrenceStart: occurrence ? start.toISOString() : null,
    scope: occurrence ? "occurrence" : "series",
  };
}

/**
 * A field change that keeps the draft coherent: a start pushed past the end
 * drags the end along by the same amount, and switching all-day keeps the
 * days while dropping the times.
 */
export function changeDraftField<Field extends SkyCalendarEventDraftField>(
  draft: SkyCalendarEventDraft,
  field: Field,
  value: SkyCalendarEventDraft[Field],
): SkyCalendarEventDraft {
  const next = { ...draft, [field]: value };
  if (field === "start" && typeof value === "string") {
    const previous = Date.parse(`${draft.start}:00Z`);
    const moved = Date.parse(`${value}:00Z`);
    const end = Date.parse(`${draft.end}:00Z`);
    if ([previous, moved, end].every(Number.isFinite) && moved > end) {
      next.end = localInputFromInstant(
        new Date(end + (moved - previous)),
        "UTC",
      );
    }
  }
  if (field === "allDay" && value === true) {
    next.start = `${draft.start.slice(0, 10)}T00:00`;
    next.end = `${draft.end.slice(0, 10)}T00:00`;
  }
  return next;
}

export function parseAttendees(value: string): string[] | null {
  const emails = value
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const valid = emails.every((email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  );
  return valid
    ? [...new Set(emails.map((email) => email.toLowerCase()))]
    : null;
}

/**
 * The model input for a draft. Guests already on the event keep their answer
 * and their name; only newly typed addresses start at "needs-action". Saving
 * a title must never reset a guest's RSVP.
 */
export function inputFromDraft(
  draft: SkyCalendarEventDraft,
  existing: ProductEvent | null,
): ProductEventInput {
  const emails = parseAttendees(draft.attendees);
  if (emails === null) throw new DraftError("attendees");
  const known = new Map(
    (existing?.attendees ?? []).map((attendee) => [
      attendee.email.toLowerCase(),
      attendee,
    ]),
  );
  const attendees: ProductAttendee[] = emails.map(
    (email) => known.get(email) ?? { email, response: "needs-action" },
  );
  let start: Date;
  let end: Date;
  try {
    if (draft.allDay) {
      start = instantFromLocalInput(
        `${draft.start.slice(0, 10)}T00:00`,
        draft.timeZone,
      );
      end = new Date(
        instantFromLocalInput(
          `${draft.end.slice(0, 10)}T00:00`,
          draft.timeZone,
        ).getTime() + DAY_MS,
      );
    } else {
      start = instantFromLocalInput(draft.start, draft.timeZone);
      end = instantFromLocalInput(draft.end, draft.timeZone);
    }
  } catch {
    throw new DraftError("time");
  }
  if (start >= end) throw new DraftError("order");
  const description = draft.description.trim();
  const location = draft.location.trim();
  const rule = draft.recurrenceRule.trim();
  return {
    title: draft.title.trim(),
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: draft.allDay,
    timeZone: draft.timeZone,
    ...(rule ? { recurrenceRule: rule } : {}),
    recurrenceExceptions: existing?.recurrenceExceptions ?? [],
    status: draft.status,
    visibility: draft.visibility,
    attendees,
    conference: draft.conference,
  };
}

export class DraftError extends Error {
  constructor(readonly reason: "attendees" | "time" | "order") {
    super(reason);
  }
}

export function draftErrorMessage(error: unknown): string {
  if (error instanceof DraftError) {
    switch (error.reason) {
      case "attendees":
        return "Enter valid guest email addresses separated by commas.";
      case "time":
        return "This local time does not exist in the selected time zone.";
      case "order":
        return "The end must be after the start.";
    }
  }
  return "The event could not be saved.";
}

/** The same event with new instants, every other field untouched. */
export function eventInput(
  event: ProductEvent,
  start: Date,
  end: Date,
  recurrenceExceptions = event.recurrenceExceptions,
): ProductEventInput {
  return {
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: event.allDay,
    timeZone: event.timeZone,
    ...(event.recurrenceRule ? { recurrenceRule: event.recurrenceRule } : {}),
    recurrenceExceptions,
    status: event.status,
    visibility: event.visibility,
    attendees: event.attendees,
    conference: event.conference,
  };
}

/**
 * Moving a whole series from one of its occurrences: the series keeps its
 * first start date and takes the occurrence's new wall-clock time and
 * duration. Exceptions shift by the same offset so they still point at the
 * instants they excluded.
 */
export function moveSeriesInput(
  master: ProductEvent,
  input: ProductEventInput,
  occurrenceStart: string,
): ProductEventInput {
  const offset = Date.parse(input.start) - Date.parse(occurrenceStart);
  const duration = Date.parse(input.end) - Date.parse(input.start);
  const start = new Date(Date.parse(master.start) + offset);
  return {
    ...input,
    start: start.toISOString(),
    end: new Date(start.getTime() + duration).toISOString(),
    recurrenceExceptions: master.recurrenceExceptions.map((value) =>
      new Date(Date.parse(value) + offset).toISOString(),
    ),
  };
}

export function scheduleLabel(
  draft: SkyCalendarEventDraft,
  locale: string | undefined,
): string {
  const startWall = new Date(`${draft.start}:00Z`);
  const endWall = new Date(`${draft.end}:00Z`);
  if (
    !Number.isFinite(startWall.getTime()) ||
    !Number.isFinite(endWall.getTime())
  ) {
    return "";
  }
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const sameDay = dateKey(startWall) === dateKey(endWall);
  if (draft.allDay) {
    return sameDay
      ? day.format(startWall)
      : `${day.format(startWall)} – ${day.format(endWall)}`;
  }
  return sameDay
    ? `${day.format(startWall)}, ${time.format(startWall)} – ${time.format(endWall)}`
    : `${day.format(startWall)} ${time.format(startWall)} – ${day.format(endWall)} ${time.format(endWall)}`;
}

export function roundUpToSlot(
  instant: Date,
  timeZone: string,
  minutes: number,
): Date {
  const wall = wallDateFromInstant(instant, timeZone);
  wall.setUTCMinutes(Math.ceil(wall.getUTCMinutes() / minutes) * minutes, 0, 0);
  return instantFromWallDate(wall, timeZone);
}

// ── the calendar as it will be ──────────────────────────────────────────────

/** The id of the draft's own block on the grid, while the editor is open. */
export const DRAFT_EVENT_ID = "draft";
const PROVISIONAL_PREFIX = "provisional-";
let provisionalCount = 0;

/** An id for an event the server has not answered for yet. */
export function provisionalEventId(): string {
  provisionalCount += 1;
  return `${PROVISIONAL_PREFIX}${provisionalCount}`;
}

/** The draft block, or an event still waiting for the server: shown, never edited. */
export function isProvisionalEvent(id: string): boolean {
  return id === DRAFT_EVENT_ID || id.startsWith(PROVISIONAL_PREFIX);
}

function provisional(
  id: string,
  calendarId: string,
  input: ProductEventInput,
): ProductEvent {
  return {
    id,
    calendarId,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    timeZone: input.timeZone,
    recurrenceRule: input.recurrenceRule ?? null,
    recurrenceExceptions: input.recurrenceExceptions ?? [],
    status: input.status,
    visibility: input.visibility,
    attendees: input.attendees,
    conference: input.conference ?? null,
  };
}

function withException(
  series: ProductEvent,
  occurrenceStart: string,
): ProductEvent {
  return {
    ...series,
    recurrenceExceptions: [
      ...new Set([...series.recurrenceExceptions, occurrenceStart]),
    ],
  };
}

/**
 * The events once the draft is saved — the same three cases the save itself
 * goes through: a new event, a whole event (or series) replaced, or one
 * occurrence detached from its series. A screen shows this twice: as a
 * preview while the draft is edited, and as the result while the server has
 * not answered yet, so nothing on the grid ever jumps back.
 */
export function eventsAfterSave(
  events: readonly ProductEvent[],
  draft: Readonly<SkyCalendarEventDraft>,
  input: ProductEventInput,
  calendarId: string,
  newId: string,
): ProductEvent[] {
  const master = draft.id
    ? (events.find((event) => event.id === draft.id) ?? null)
    : null;
  if (!master) return [...events, provisional(newId, calendarId, input)];
  if (draft.occurrenceStart && draft.scope === "occurrence") {
    const occurrenceStart = draft.occurrenceStart;
    return [
      ...events.map((event) =>
        event.id === master.id ? withException(master, occurrenceStart) : event,
      ),
      {
        ...provisional(newId, calendarId, input),
        recurrenceRule: null,
        recurrenceExceptions: [],
      },
    ];
  }
  const body = draft.occurrenceStart
    ? moveSeriesInput(master, input, draft.occurrenceStart)
    : input;
  return events.map((event) =>
    event.id === master.id ? provisional(master.id, calendarId, body) : event,
  );
}

/** The events once the draft's event (or its occurrence) is deleted. */
export function eventsAfterDelete(
  events: readonly ProductEvent[],
  draft: Readonly<SkyCalendarEventDraft>,
): ProductEvent[] {
  if (draft.occurrenceStart && draft.scope === "occurrence") {
    const occurrenceStart = draft.occurrenceStart;
    return events.map((event) =>
      event.id === draft.id ? withException(event, occurrenceStart) : event,
    );
  }
  return events.filter((event) => event.id !== draft.id);
}

/**
 * The events once one is dragged to new instants. A dragged occurrence
 * leaves its series, which forgets that date, exactly as the save does.
 */
export function eventsAfterMove(
  events: readonly ProductEvent[],
  master: ProductEvent,
  start: Date,
  end: Date,
  occurrenceStart: string | null,
  newId: string,
): ProductEvent[] {
  if (occurrenceStart) {
    return [
      ...events.map((event) =>
        event.id === master.id ? withException(master, occurrenceStart) : event,
      ),
      {
        ...provisional(
          newId,
          master.calendarId,
          eventInput(master, start, end),
        ),
        recurrenceRule: null,
        recurrenceExceptions: [],
      },
    ];
  }
  return events.map((event) =>
    event.id === master.id
      ? provisional(
          master.id,
          master.calendarId,
          eventInput(master, start, end),
        )
      : event,
  );
}

/**
 * What the grid shows while the editor is open: the draft in place, as it
 * would be saved. Guests are left out of a preview (a half-typed address is
 * not an error yet); a draft whose times do not hold shows nothing new.
 */
export function eventsWithDraft(
  events: readonly ProductEvent[],
  draft: Readonly<SkyCalendarEventDraft> | null,
  calendarId: string,
): ProductEvent[] {
  if (!draft) return [...events];
  const master = draft.id
    ? (events.find((event) => event.id === draft.id) ?? null)
    : null;
  let input: ProductEventInput;
  try {
    input = inputFromDraft({ ...draft, attendees: "" }, master);
  } catch {
    return [...events];
  }
  return eventsAfterSave(
    events,
    draft,
    { ...input, attendees: master?.attendees ?? [] },
    draft.calendarId || calendarId,
    DRAFT_EVENT_ID,
  );
}

// ── periods ─────────────────────────────────────────────────────────────────

export type SkyCalendarView = "month" | "week" | "day" | "agenda";

export const AGENDA_DAYS = 14;
export const COMPACT_WEEK_DAYS = 3;

export interface VisiblePeriod {
  /** Inclusive start instant of the data to fetch. */
  from: Date;
  /** Exclusive end instant of the data to fetch. */
  to: Date;
  /** The instant the views anchor on. */
  viewDate: Date;
}

/**
 * What a view shows for a cursor date. The month grid always covers six
 * weeks so a fetch never misses a chip; a compact week is three days starting
 * on the cursor, since a phone cannot show seven.
 */
export function visiblePeriod(
  dates: DateAdapter,
  cursor: Date,
  view: SkyCalendarView,
  compact: boolean,
  zone: string,
  weekStartsOn: number,
): VisiblePeriod {
  const anchor = dates.startOfDay(dates.toZoned(cursor, zone));
  let from: ZonedDateTime;
  let to: ZonedDateTime;
  switch (view) {
    case "month":
      from = dates.startOfWeek(dates.startOfMonth(anchor), weekStartsOn);
      to = dates.addDays(from, 42);
      break;
    case "week":
      from = compact ? anchor : dates.startOfWeek(anchor, weekStartsOn);
      to = dates.addDays(from, compact ? COMPACT_WEEK_DAYS : 7);
      break;
    case "day":
      from = anchor;
      to = dates.addDays(anchor, 1);
      break;
    case "agenda":
      from = anchor;
      to = dates.addDays(anchor, AGENDA_DAYS);
      break;
  }
  return {
    from: new Date(from.epochMs),
    to: new Date(to.epochMs),
    viewDate: new Date(anchor.epochMs),
  };
}

export function moveCursor(
  dates: DateAdapter,
  cursor: Date,
  view: SkyCalendarView,
  compact: boolean,
  zone: string,
  direction: -1 | 1,
): Date {
  const anchor = dates.startOfDay(dates.toZoned(cursor, zone));
  switch (view) {
    case "month":
      return new Date(dates.addMonths(anchor, direction).epochMs);
    case "week":
      return new Date(
        dates.addDays(anchor, direction * (compact ? COMPACT_WEEK_DAYS : 7))
          .epochMs,
      );
    case "day":
      return new Date(dates.addDays(anchor, direction).epochMs);
    case "agenda":
      return new Date(dates.addDays(anchor, direction * AGENDA_DAYS).epochMs);
  }
}

export function periodTitle(
  period: VisiblePeriod,
  view: SkyCalendarView,
  locale: string | undefined,
  timeZone: string,
): string {
  if (view === "month") {
    // The grid starts in the previous month; ten days in is always the month shown.
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone,
    }).format(new Date(period.from.getTime() + 10 * DAY_MS));
  }
  if (view === "day") {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }).format(period.from);
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).formatRange(period.from, new Date(period.to.getTime() - DAY_MS));
}

export function toInstant(value: Date | ZonedDateTime): Date {
  return value instanceof Date ? value : new Date(value.epochMs);
}

/** The first palette colour no calendar uses yet. */
export function nextCalendarColor(
  calendars: readonly ProductCalendar[],
): string {
  const used = new Set(calendars.map((calendar) => calendar.color));
  return (
    CALENDAR_COLORS.find((color) => !used.has(color)) ?? DEFAULT_CALENDAR_COLOR
  );
}
