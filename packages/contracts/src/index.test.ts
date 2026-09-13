import { describe, expect, it } from "vitest";
import { createClient, eventRangeSchema, eventSchema } from "./index";

describe("calendar contracts", () => {
  it("rejects an inverted range", () => {
    expect(
      eventRangeSchema.safeParse({
        from: "2026-09-14T12:00:00.000Z",
        to: "2026-09-14T11:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects unbounded attendee collections", () => {
    const event = {
      id: "event-1",
      calendarId: "calendar-1",
      title: "Revue",
      description: null,
      location: null,
      start: "2026-09-14T12:00:00.000Z",
      end: "2026-09-14T13:00:00.000Z",
      allDay: false,
      timeZone: "Europe/Paris",
      recurrenceRule: null,
      recurrenceExceptions: [],
      status: "confirmed",
      visibility: "default",
      attendees: Array.from({ length: 201 }, (_, index) => ({
        email: `person-${index}@example.com`,
        response: "needs-action",
      })),
      createdAt: "2026-09-14T10:00:00.000Z",
      updatedAt: "2026-09-14T10:00:00.000Z",
    };
    expect(eventSchema.safeParse(event).success).toBe(false);
  });

  it("encodes identifiers and authenticates write requests", async () => {
    const calls: { input: string; init?: RequestInit }[] = [];
    const fetchStub = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ input: String(input), init });
      return new Response(
        JSON.stringify({
          id: "calendar-1",
          workspaceId: "workspace/one",
          name: "Équipe",
          color: "#2563eb",
          timeZone: "Europe/Paris",
          createdAt: "2026-09-14T10:00:00.000Z",
          updatedAt: "2026-09-14T10:00:00.000Z",
        }),
      );
    };
    const client = createClient({
      baseUrl: "https://calendar.example",
      getToken: () => "signed-token",
      fetch: fetchStub as typeof fetch,
    });

    await client.createCalendar("workspace/one", {
      name: "Équipe",
      color: "#2563eb",
      timeZone: "Europe/Paris",
    });

    expect(calls[0]?.input).toBe(
      "https://calendar.example/api/v1/workspaces/workspace%2Fone/calendars",
    );
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer signed-token",
    );
    expect(calls[0]?.init?.method).toBe("POST");
  });
});
