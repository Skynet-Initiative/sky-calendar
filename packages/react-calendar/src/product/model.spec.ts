import { describe, expect, it } from "vitest";
import { DateFnsDateAdapter } from "../date-fns/date-fns-adapter";
import {
  changeDraftField,
  draftFromEvent,
  emptyDraft,
  inputFromDraft,
  moveCursor,
  moveSeriesInput,
  nextCalendarColor,
  parseAttendees,
  periodTitle,
  roundUpToSlot,
  visiblePeriod,
} from "./model";
import type { ProductEvent } from "./types";

const dates = new DateFnsDateAdapter();

const event: ProductEvent = {
  id: "event-1",
  calendarId: "cal-1",
  title: "Offsite",
  description: null,
  location: null,
  start: "2026-10-26T00:00:00.000Z",
  end: "2026-10-28T00:00:00.000Z",
  allDay: true,
  timeZone: "UTC",
  recurrenceRule: null,
  recurrenceExceptions: [],
  status: "tentative",
  visibility: "private",
  attendees: [
    { email: "ana@example.com", displayName: "Ana", response: "accepted" },
  ],
  conference: {
    provider: "skydirect",
    id: "fmYTdnEKrcwM",
    joinUrl: "https://app.example.test/direct/fmYTdnEKrcwM/",
  },
};

describe("event drafts", () => {
  it("shows an all-day event by its inclusive last day and stores the exclusive end", () => {
    const draft = draftFromEvent(event, null);
    expect(draft.start).toBe("2026-10-26T00:00");
    expect(draft.end).toBe("2026-10-27T00:00");
    const input = inputFromDraft(draft, event);
    expect(input.start).toBe(event.start);
    expect(input.end).toBe(event.end);
  });

  it("keeps guest answers, status, visibility and the video call when only the title changes", () => {
    const draft = changeDraftField(
      draftFromEvent(event, null),
      "title",
      "Offsite, day two",
    );
    const input = inputFromDraft(draft, event);
    expect(input).toMatchObject({
      title: "Offsite, day two",
      status: "tentative",
      visibility: "private",
      attendees: event.attendees,
      conference: event.conference,
    });
  });

  it("adds a typed guest as needs-action without touching the others", () => {
    const draft = changeDraftField(
      draftFromEvent(event, null),
      "attendees",
      "Ana@example.com, bob@example.com",
    );
    expect(inputFromDraft(draft, event).attendees).toEqual([
      { email: "ana@example.com", displayName: "Ana", response: "accepted" },
      { email: "bob@example.com", response: "needs-action" },
    ]);
    expect(parseAttendees("not an email")).toBeNull();
  });

  it("drags the end along when the start is pushed past it", () => {
    const draft = emptyDraft({
      calendarId: "cal-1",
      start: new Date("2026-10-26T09:00:00.000Z"),
      end: new Date("2026-10-26T10:00:00.000Z"),
      allDay: false,
      timeZone: "UTC",
    });
    const moved = changeDraftField(draft, "start", "2026-10-26T12:00");
    expect(moved.end).toBe("2026-10-26T13:00");
    expect(() => inputFromDraft({ ...draft, end: draft.start }, null)).toThrow(
      "order",
    );
  });

  it("moves a whole series by the offset of the edited occurrence", () => {
    const series: ProductEvent = {
      ...event,
      allDay: false,
      start: "2026-10-05T09:00:00.000Z",
      end: "2026-10-05T09:30:00.000Z",
      recurrenceRule: "FREQ=WEEKLY",
      recurrenceExceptions: ["2026-10-12T09:00:00.000Z"],
    };
    const occurrence = "2026-10-19T09:00:00.000Z";
    const input = inputFromDraft(
      changeDraftField(
        draftFromEvent(series, {
          start: new Date(occurrence),
          end: new Date("2026-10-19T09:30:00.000Z"),
        }),
        "start",
        "2026-10-19T10:00",
      ),
      series,
    );
    const moved = moveSeriesInput(series, input, occurrence);
    expect(moved.start).toBe("2026-10-05T10:00:00.000Z");
    expect(moved.end).toBe("2026-10-05T10:30:00.000Z");
    expect(moved.recurrenceExceptions).toEqual(["2026-10-12T10:00:00.000Z"]);
  });

  it("rounds a start up to the next slot in the calendar's zone", () => {
    expect(
      roundUpToSlot(
        new Date("2026-10-26T08:07:00.000Z"),
        "UTC",
        30,
      ).toISOString(),
    ).toBe("2026-10-26T08:30:00.000Z");
  });
});

describe("visible periods", () => {
  const cursor = new Date("2026-10-14T15:00:00.000Z");

  it("covers six Monday-based weeks for a month", () => {
    const period = visiblePeriod(dates, cursor, "month", false, "UTC", 1);
    expect(period.from.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(periodTitle(period, "month", "en", "UTC")).toBe("October 2026");
  });

  it("shows three days from the cursor when compact, a Monday week otherwise", () => {
    const compact = visiblePeriod(dates, cursor, "week", true, "UTC", 1);
    expect(compact.from.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(compact.to.toISOString()).toBe("2026-10-17T00:00:00.000Z");
    const wide = visiblePeriod(dates, cursor, "week", false, "UTC", 1);
    expect(wide.from.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(wide.to.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("steps the cursor by what the view shows", () => {
    expect(
      moveCursor(dates, cursor, "month", false, "UTC", 1).toISOString(),
    ).toBe("2026-11-14T00:00:00.000Z");
    expect(
      moveCursor(dates, cursor, "week", true, "UTC", -1).toISOString(),
    ).toBe("2026-10-11T00:00:00.000Z");
    expect(
      moveCursor(dates, cursor, "day", false, "UTC", 1).toISOString(),
    ).toBe("2026-10-15T00:00:00.000Z");
  });

  it("picks the first palette colour nobody uses", () => {
    expect(
      nextCalendarColor([
        { id: "a", name: "A", color: "#2563eb", timeZone: "UTC" },
      ]),
    ).toBe("#7c3aed");
  });
});
