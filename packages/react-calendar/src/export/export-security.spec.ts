import { describe, expect, it } from "vitest";
import { eventsToCsv } from "./csv-export";
import { eventsToIcs } from "./ics-export";

const event = {
  id: "event-1",
  title: '=HYPERLINK("https://invalid.example")',
  start: new Date("2026-09-14T12:00:00.000Z"),
  end: new Date("2026-09-14T13:00:00.000Z"),
};

describe("calendar exports", () => {
  it("neutralizes spreadsheet formulas", () => {
    expect(eventsToCsv([event])).toContain("'=HYPERLINK");
    expect(eventsToCsv([{ ...event, title: "\t=SUM(1,1)" }])).toContain(
      "'\t=SUM",
    );
  });

  it("escapes line breaks in PRODID", () => {
    const output = eventsToIcs([event], {
      zone: "UTC",
      prodId: "safe\r\nX-INJECTED:1",
    });
    expect(output).not.toContain("\r\nX-INJECTED");
  });

  it("does not emit an RRULE containing a line break", () => {
    const output = eventsToIcs(
      [{ ...event, recurrenceRule: "FREQ=DAILY\r\nX-INJECTED:1" }],
      { zone: "UTC" },
    );
    expect(output).not.toContain("X-INJECTED");
  });

  it("folds multibyte content at 75 UTF-8 octets", () => {
    const output = eventsToIcs([{ ...event, title: "é".repeat(100) }], {
      zone: "UTC",
    });
    const encoder = new TextEncoder();
    for (const line of output.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("preserves portable event details and recurrence exceptions", () => {
    const detailed = {
      ...event,
      description: "Preparation notes",
      location: "Room 3",
      attendees: ["guest@example.com"],
      visibility: "private" as const,
      recurrenceRule: "FREQ=WEEKLY;COUNT=4",
      recurrenceExceptions: [new Date("2026-09-21T12:00:00.000Z")],
    };
    const ics = eventsToIcs([detailed], { zone: "UTC" });
    expect(ics).toContain("DESCRIPTION:Preparation notes");
    expect(ics).toContain("LOCATION:Room 3");
    expect(ics).toContain("ATTENDEE:mailto:guest@example.com");
    expect(ics).toContain("CLASS:PRIVATE");
    expect(ics).toContain("EXDATE:20260921T120000Z");

    const csv = eventsToCsv([detailed]);
    expect(csv).toContain("description,location,attendees,visibility");
    expect(csv).toContain("guest@example.com");
    expect(csv).toContain("2026-09-21T12:00:00.000Z");
  });
});
