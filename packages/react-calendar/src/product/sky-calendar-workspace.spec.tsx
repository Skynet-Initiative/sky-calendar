import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("SkyCalendarWorkspace", () => {
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
    fireEvent.click(day);
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
});
