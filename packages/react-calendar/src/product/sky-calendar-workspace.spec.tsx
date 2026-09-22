import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SkyCalendarWorkspace,
  type SkyCalendarCalendarComposerRenderProps,
  type SkyCalendarEventComposerRenderProps,
} from "./sky-calendar-workspace";
import type {
  ProductCalendar,
  ProductEvent,
  ProductEventInput,
  SkyCalendarTransport,
} from "./types";

const calendar: ProductCalendar = {
  id: "cal-1",
  name: "Calendar",
  color: "#2563eb",
  timeZone: "UTC",
};

function createProductEvent(
  calendarId: string,
  input: ProductEventInput,
): Promise<ProductEvent> {
  return Promise.resolve({
    ...input,
    id: "event-created",
    calendarId,
    description: input.description ?? null,
    location: input.location ?? null,
    recurrenceRule: input.recurrenceRule ?? null,
    recurrenceExceptions: input.recurrenceExceptions ?? [],
  });
}

function firePointerEvent(
  target: Element,
  type: string,
  init: {
    button?: number;
    clientX?: number;
    clientY?: number;
    pointerId: number;
    pointerType: string;
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    pointerId: { value: init.pointerId },
    pointerType: { value: init.pointerType },
  });
  fireEvent(target, event);
}

function TestEventComposer(props: SkyCalendarEventComposerRenderProps) {
  return (
    <section aria-label="Host event panel">
      <span>{props.scheduleLabel}</span>
      <button type="button" onClick={props.onClose}>
        Close host event panel
      </button>
    </section>
  );
}

function TestCalendarComposer(props: SkyCalendarCalendarComposerRenderProps) {
  return (
    <section aria-label="Host calendar panel">
      <button type="button" onClick={props.onClose}>
        Close host calendar panel
      </button>
    </section>
  );
}

describe("SkyCalendarWorkspace", () => {
  it("can keep secondary calendar actions out of a host interface", async () => {
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
      <SkyCalendarWorkspace
        transport={transport}
        timeZone="UTC"
        locale="en"
        showSecondaryActions={false}
      />,
    );

    await screen.findByRole("button", { name: "New event" });
    expect(screen.queryByRole("button", { name: "New calendar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export ICS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
  });

  it("delegates composer presentation to the host application", async () => {
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
      <SkyCalendarWorkspace
        transport={transport}
        timeZone="UTC"
        locale="en"
        eventComposer={TestEventComposer}
        calendarComposer={TestCalendarComposer}
      />,
    );
    await screen.findAllByRole("button", {
      name: /open .* in day view/i,
    });
    fireEvent.click(screen.getByRole("button", { name: "New event" }));
    expect(
      screen.getByRole("region", { name: "Host event panel" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "New event" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Close host event panel" }),
    );
    expect(
      screen.queryByRole("region", { name: "Host event panel" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New calendar" }));
    expect(
      screen.getByRole("region", { name: "Host calendar panel" }),
    ).toBeTruthy();
  });

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
      await screen.findAllByRole("button", { name: /open .* in day view/i }),
    ).not.toHaveLength(0);
  });

  it("opens a selected month date in the day view", async () => {
    const listEvents = vi.fn().mockResolvedValue([]);
    const transport: SkyCalendarTransport = {
      listCalendars: vi.fn().mockResolvedValue([calendar]),
      createCalendar: vi.fn().mockResolvedValue(calendar),
      listEvents,
      exportEvents: vi.fn().mockResolvedValue([]),
      createEvent: vi.fn(),
      replaceEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };

    render(
      <SkyCalendarWorkspace transport={transport} timeZone="UTC" locale="en" />,
    );
    const [day] = await screen.findAllByRole("button", {
      name: /open .* in day view/i,
    });
    expect(day).toBeDefined();
    if (!day) throw new Error("month view did not expose a day target");
    const selectedDate = day.dataset.start?.slice(0, 10);
    if (!selectedDate) throw new Error("day target did not expose its date");
    const selectedLabel = day
      .getAttribute("aria-label")
      ?.replace(/^Open | in day view$/g, "");
    if (!selectedLabel) throw new Error("day target did not expose its label");
    fireEvent.click(day);
    await waitFor(() => expect(listEvents).toHaveBeenCalledTimes(2));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      selectedLabel,
    );
    expect(
      screen
        .getByRole("group", { name: "Time grid" })
        .getAttribute("data-days"),
    ).toBe("1");
    const [selectedSlot] = screen.getAllByRole("button", {
      name: /New event,.*, 09:00/,
    });
    expect(selectedSlot?.dataset.start?.slice(0, 10)).toBe(selectedDate);
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "New event" })).toBeNull();
  });

  it("does not offer a redundant Today action for the current period", async () => {
    const listEvents = vi.fn().mockResolvedValue([]);
    const transport: SkyCalendarTransport = {
      listCalendars: vi.fn().mockResolvedValue([calendar]),
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

    await screen.findAllByRole("button", { name: /open .* in day view/i });
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    await waitFor(() => expect(listEvents).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(listEvents).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
  });

  it("creates a timed draft from a dragged range in the week grid", async () => {
    const createEvent = vi.fn(createProductEvent);
    const transport: SkyCalendarTransport = {
      listCalendars: vi.fn().mockResolvedValue([calendar]),
      createCalendar: vi.fn(),
      listEvents: vi.fn().mockResolvedValue([]),
      exportEvents: vi.fn(),
      createEvent,
      replaceEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };

    render(
      <SkyCalendarWorkspace transport={transport} timeZone="UTC" locale="en" />,
    );
    await screen.findAllByRole("button", { name: /open .* in day view/i });
    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    const start = screen.getAllByRole("button", {
      name: /New event,.*, 09:15/,
    })[0];
    const end = screen.getAllByRole("button", {
      name: /New event,.*, 09:30/,
    })[0];
    const midnight = screen.getAllByRole("button", {
      name: /New event,.*, 00:00/,
    })[0];
    const grid = screen.getByRole("group", { name: "Time grid" });
    if (!start || !end || !midnight) {
      throw new Error("week grid did not expose time slots");
    }
    const selectedDate = start.dataset.start?.slice(0, 10);
    if (!selectedDate) throw new Error("time slot did not expose its date");
    vi.spyOn(start, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 20,
      left: 0,
      right: 20,
      top: 80,
      width: 20,
      x: 0,
      y: 80,
      toJSON: vi.fn(),
    });
    vi.spyOn(end, "getBoundingClientRect").mockReturnValue({
      bottom: 140,
      height: 20,
      left: 0,
      right: 20,
      top: 120,
      width: 20,
      x: 0,
      y: 120,
      toJSON: vi.fn(),
    });
    firePointerEvent(midnight, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 90,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(document.querySelectorAll(".skycal__range-preview")).toHaveLength(1);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(end),
    });
    firePointerEvent(grid, "pointermove", {
      clientX: 10,
      clientY: 130,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(
      document.querySelectorAll('[data-range-selected="true"]'),
    ).toHaveLength(2);
    firePointerEvent(grid, "pointerup", {
      clientX: 10,
      clientY: 130,
      pointerId: 1,
      pointerType: "mouse",
    });
    Reflect.deleteProperty(document, "elementFromPoint");

    expect(screen.getByRole("dialog", { name: "New event" })).toBeTruthy();
    expect(document.querySelectorAll(".skycal__range-preview")).toHaveLength(2);
    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe(
      `${selectedDate}T09:15`,
    );
    expect((screen.getByLabelText("Ends") as HTMLInputElement).value).toBe(
      `${selectedDate}T09:45`,
    );
    fireEvent.change(screen.getByLabelText("Ends"), {
      target: { value: `${selectedDate}T10:00` },
    });
    expect(document.querySelectorAll(".skycal__range-preview")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Selected range" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledOnce());
    expect(createEvent).toHaveBeenCalledWith(
      calendar.id,
      expect.objectContaining({
        start: `${selectedDate}T09:15:00.000Z`,
        end: `${selectedDate}T10:00:00.000Z`,
        allDay: false,
      }),
    );
    await waitFor(() =>
      expect(document.querySelectorAll(".skycal__range-preview")).toHaveLength(
        0,
      ),
    );
  });

  it("navigates quarter-hour slots and days with the keyboard", async () => {
    const listEvents = vi.fn().mockResolvedValue([]);
    const transport: SkyCalendarTransport = {
      listCalendars: vi.fn().mockResolvedValue([calendar]),
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
    await screen.findAllByRole("button", { name: /open .* in day view/i });
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    await waitFor(() => expect(listEvents).toHaveBeenCalledTimes(2));

    const [start] = screen.getAllByRole("button", {
      name: /New event,.*, 09:15/,
    });
    const [nextQuarter] = screen.getAllByRole("button", {
      name: /New event,.*, 09:30/,
    });
    const [, nextQuarterDay] = screen.getAllByRole("button", {
      name: /New event,.*, 09:30/,
    });
    if (!start || !nextQuarter || !nextQuarterDay) {
      throw new Error("week grid did not expose keyboard destinations");
    }

    start.focus();
    fireEvent.keyDown(start, { key: "ArrowDown" });
    expect(document.activeElement).toBe(nextQuarter);
    fireEvent.keyDown(nextQuarter, { key: "ArrowRight" });
    expect(document.activeElement).toBe(nextQuarterDay);
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
    await screen.findAllByRole("button", {
      name: /open .* in day view/i,
    });
    const opener = screen.getByRole("button", { name: "New event" });
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "New event" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog", { name: "New event" })).toBeNull();
    expect(document.activeElement).toBe(opener);
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
