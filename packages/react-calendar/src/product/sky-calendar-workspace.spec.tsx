import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkyCalendarWorkspace } from "./sky-calendar-workspace";
import type {
  ProductCalendar,
  ProductEvent,
  SkyCalendarTransport,
} from "./types";

const calendar: ProductCalendar = {
  id: "cal-1",
  name: "Calendar",
  color: "#2563eb",
  timeZone: "UTC",
};

describe("SkyCalendarWorkspace", () => {
  it("offers a real retry after an initial loading failure", async () => {
    const listCalendars = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce([calendar]);
    const listEvents = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce([]);
    const transport: SkyCalendarTransport = {
      listCalendars,
      createCalendar: vi.fn(),
      listEvents,
      exportEvents: vi.fn(),
      createEvent: vi.fn(),
      replaceEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };

    render(
      <SkyCalendarWorkspace transport={transport} timeZone="UTC" locale="en" />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(listCalendars).toHaveBeenCalledTimes(2));
    expect(listEvents).toHaveBeenCalledTimes(2);
    expect(
      await screen.findAllByRole("button", { name: /create event on/i }),
    ).not.toHaveLength(0);
  });

  it("creates an event from a single calendar-cell click", async () => {
    const created: ProductEvent = {
      id: "event-1",
      calendarId: calendar.id,
      title: "Planning",
      description: null,
      location: null,
      start: "2026-09-14T09:00:00.000Z",
      end: "2026-09-14T10:00:00.000Z",
      allDay: true,
      timeZone: "UTC",
      recurrenceRule: null,
      recurrenceExceptions: [],
      status: "confirmed",
      visibility: "default",
      attendees: [],
    };
    const createEvent = vi.fn().mockResolvedValue(created);
    const transport: SkyCalendarTransport = {
      listCalendars: vi.fn().mockResolvedValue([calendar]),
      createCalendar: vi.fn().mockResolvedValue(calendar),
      listEvents: vi.fn().mockResolvedValue([]),
      exportEvents: vi.fn().mockResolvedValue([]),
      createEvent,
      replaceEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };

    render(
      <SkyCalendarWorkspace transport={transport} timeZone="UTC" locale="en" />,
    );
    const [day] = await screen.findAllByRole("button", {
      name: /create event on/i,
    });
    expect(day).toBeDefined();
    if (!day) throw new Error("month view did not expose a day target");
    const selectedDate = day.dataset.start?.slice(0, 10);
    if (!selectedDate) throw new Error("day target did not expose its date");
    fireEvent.click(day);
    const composer = screen.getByRole("dialog", { name: "New event" });
    expect(composer.getAttribute("aria-modal")).toBe("false");
    expect(document.querySelector("dialog")).toBeNull();
    expect(screen.getAllByText(/All day/u)).not.toHaveLength(0);
    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe(
      `${selectedDate}T00:00`,
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Planning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledOnce());
    expect(createEvent).toHaveBeenCalledWith(
      calendar.id,
      expect.objectContaining({ title: "Planning", allDay: true }),
    );
  });

  it("closes the date composer with Escape and restores focus", async () => {
    const transport: SkyCalendarTransport = {
      listCalendars: vi.fn().mockResolvedValue([calendar]),
      createCalendar: vi.fn(),
      listEvents: vi.fn().mockResolvedValue([]),
      exportEvents: vi.fn(),
      createEvent: vi.fn(),
      replaceEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };

    render(
      <SkyCalendarWorkspace transport={transport} timeZone="UTC" locale="en" />,
    );
    const [day] = await screen.findAllByRole("button", {
      name: /create event on/i,
    });
    if (!day) throw new Error("month view did not expose a day target");
    fireEvent.click(day);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "New event" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog", { name: "New event" })).toBeNull();
    expect(document.activeElement).toBe(day);
  });

  it("renders bounded recurrence instances in the visible period", async () => {
    const recurring: ProductEvent = {
      id: "event-recurring",
      calendarId: calendar.id,
      title: "Daily sync",
      description: null,
      location: null,
      start: "2026-09-01T09:00:00.000Z",
      end: "2026-09-01T09:30:00.000Z",
      allDay: false,
      timeZone: "UTC",
      recurrenceRule: "FREQ=DAILY;COUNT=3",
      recurrenceExceptions: [],
      status: "confirmed",
      visibility: "default",
      attendees: [],
    };
    const transport: SkyCalendarTransport = {
      listCalendars: vi.fn().mockResolvedValue([calendar]),
      createCalendar: vi.fn(),
      listEvents: vi.fn().mockResolvedValue([recurring]),
      exportEvents: vi.fn().mockResolvedValue([recurring]),
      createEvent: vi.fn(),
      replaceEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };

    render(
      <SkyCalendarWorkspace transport={transport} timeZone="UTC" locale="en" />,
    );

    expect(
      await screen.findAllByRole("button", { name: /Daily sync/i }),
    ).toHaveLength(3);
  });

  it("edits one recurrence by creating an exception instead of replacing the series", async () => {
    const recurring: ProductEvent = {
      id: "event-recurring",
      calendarId: calendar.id,
      title: "Daily sync",
      description: null,
      location: null,
      start: "2026-09-01T09:00:00.000Z",
      end: "2026-09-01T09:30:00.000Z",
      allDay: false,
      timeZone: "UTC",
      recurrenceRule: "FREQ=DAILY;COUNT=3",
      recurrenceExceptions: [],
      status: "confirmed",
      visibility: "default",
      attendees: [],
    };
    const standalone = {
      ...recurring,
      id: "event-exception",
      title: "Moved sync",
      recurrenceRule: null,
    };
    const replaceEvent = vi
      .fn()
      .mockImplementation(
        async (_id: string, input: { recurrenceExceptions?: string[] }) => ({
          ...recurring,
          recurrenceExceptions: input.recurrenceExceptions ?? [],
        }),
      );
    const createEvent = vi.fn().mockResolvedValue(standalone);
    const transport: SkyCalendarTransport = {
      listCalendars: vi.fn().mockResolvedValue([calendar]),
      createCalendar: vi.fn(),
      listEvents: vi.fn().mockResolvedValue([recurring]),
      exportEvents: vi.fn().mockResolvedValue([recurring]),
      createEvent,
      replaceEvent,
      deleteEvent: vi.fn(),
    };

    render(
      <SkyCalendarWorkspace transport={transport} timeZone="UTC" locale="en" />,
    );
    const occurrences = await screen.findAllByRole("button", {
      name: /Daily sync/i,
    });
    const occurrence = occurrences[1];
    if (!occurrence) throw new Error("recurrence instance not rendered");
    fireEvent.click(occurrence);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Moved sync" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledOnce());
    expect(replaceEvent).toHaveBeenCalledWith(
      recurring.id,
      expect.objectContaining({
        recurrenceRule: recurring.recurrenceRule,
        recurrenceExceptions: ["2026-09-02T09:00:00.000Z"],
      }),
    );
    expect(createEvent).toHaveBeenCalledWith(
      calendar.id,
      expect.objectContaining({
        title: "Moved sync",
        recurrenceRule: undefined,
      }),
    );
  });
});
