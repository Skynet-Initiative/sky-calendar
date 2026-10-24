import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SkyCalendarWorkspace,
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
  name: "Team",
  color: "#2563eb",
  timeZone: "UTC",
};

function transportWith(
  overrides: Partial<SkyCalendarTransport> = {},
  events: ProductEvent[] = [],
): SkyCalendarTransport {
  return {
    listCalendars: vi.fn().mockResolvedValue([calendar]),
    createCalendar: vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ ...input, id: "cal-created" }),
      ),
    updateCalendar: vi
      .fn()
      .mockImplementation((id, input) =>
        Promise.resolve({ ...calendar, ...input, id }),
      ),
    deleteCalendar: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue(events),
    exportEvents: vi.fn().mockResolvedValue(events),
    createEvent: vi.fn().mockImplementation(created),
    replaceEvent: vi
      .fn()
      .mockImplementation((id: string, input: ProductEventInput) =>
        created(calendar.id, input).then((event) => ({ ...event, id })),
      ),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function created(
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
    conference: input.conference ?? null,
  });
}

function inAnHour(): Date {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  start.setUTCHours(start.getUTCHours() + 1);
  return start;
}

function timedEvent(overrides: Partial<ProductEvent> = {}): ProductEvent {
  const start = inAnHour();
  return {
    id: "event-1",
    calendarId: calendar.id,
    title: "Planning review",
    description: null,
    location: null,
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    allDay: false,
    timeZone: "UTC",
    recurrenceRule: null,
    recurrenceExceptions: [],
    status: "confirmed",
    visibility: "default",
    attendees: [],
    conference: null,
    ...overrides,
  };
}

function renderWorkspace(
  transport: SkyCalendarTransport,
  props: Partial<Parameters<typeof SkyCalendarWorkspace>[0]> = {},
) {
  return render(
    <SkyCalendarWorkspace
      transport={transport}
      timeZone="UTC"
      locale="en"
      initialView="agenda"
      {...props}
    />,
  );
}

/** The first row carrying the title: a series or a multi-day event lists several. */
async function openEvent(title: string) {
  const [row] = await screen.findAllByRole("button", {
    name: new RegExp(title),
  });
  if (!row) throw new Error(`no row for ${title}`);
  fireEvent.click(row);
  return screen.findByRole("dialog");
}

function pretendNarrow(width: number) {
  const observers: ResizeObserverCallback[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.push(callback);
      }
      observe() {
        for (const callback of observers) callback([], this as never);
      }
      disconnect() {
        // nothing to release
      }
      unobserve() {
        // nothing to release
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width,
    height: 800,
    top: 0,
    left: 0,
    right: width,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SkyCalendarWorkspace", () => {
  it("loads the visible period and lists its events", async () => {
    const transport = transportWith({}, [timedEvent()]);
    renderWorkspace(transport);

    await screen.findByRole("button", { name: /Planning review/ });
    const [from, to] = (transport.listEvents as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, string];
    expect(Date.parse(from)).toBeLessThan(Date.parse(to));
    expect(
      screen
        .getByRole("button", { name: "Agenda" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
  });

  it("starts in Agenda and shows three-day weeks when the box is narrow", async () => {
    pretendNarrow(375);
    renderWorkspace(transportWith(), { initialView: "month" });

    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Agenda" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(screen.getByRole("button", { name: "3 days" })).toBeTruthy();
  });

  it("keeps a wide box on the requested view and offers Today after moving", async () => {
    renderWorkspace(transportWith(), { initialView: "month" });
    await screen.findByRole("group", { name: "Calendar view" });
    expect(
      screen
        .getByRole("button", { name: "Month" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
  });

  it("lets a reader open an event without offering any change", async () => {
    const transport = transportWith({}, [timedEvent({ location: "Room 4" })]);
    renderWorkspace(transport, { editable: false });

    const dialog = await openEvent("Planning review");
    expect(within(dialog).getByDisplayValue("Room 4")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: /New event/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("saves a title without touching guest answers, status, visibility or the all-day end", async () => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 86_400_000);
    const event = timedEvent({
      title: "Offsite",
      allDay: true,
      start: start.toISOString(),
      end: end.toISOString(),
      status: "tentative",
      visibility: "private",
      attendees: [
        { email: "ana@example.com", displayName: "Ana", response: "accepted" },
      ],
    });
    const transport = transportWith({}, [event]);
    renderWorkspace(transport);

    const dialog = await openEvent("Offsite");
    const lastDay = within(dialog).getByLabelText(
      "Last day",
    ) as HTMLInputElement;
    expect(lastDay.value).toBe(
      new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10),
    );
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Offsite, day two" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(transport.replaceEvent).toHaveBeenCalledTimes(1),
    );
    const [, input] = (transport.replaceEvent as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, ProductEventInput];
    expect(input).toMatchObject({
      title: "Offsite, day two",
      status: "tentative",
      visibility: "private",
      start: start.toISOString(),
      end: end.toISOString(),
      attendees: [
        { email: "ana@example.com", displayName: "Ana", response: "accepted" },
      ],
    });
  });

  it("edits one occurrence by detaching it and excluding its date from the series", async () => {
    const series = timedEvent({
      id: "series",
      title: "Stand-up",
      recurrenceRule: "FREQ=DAILY",
    });
    const transport = transportWith({}, [series]);
    renderWorkspace(transport);

    const dialog = await openEvent("Stand-up");
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Stand-up, moved" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(transport.replaceEvent).toHaveBeenCalledTimes(1),
    );
    const [calendarId, createdInput] = (
      transport.createEvent as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [string, ProductEventInput];
    expect(calendarId).toBe(calendar.id);
    expect(createdInput.recurrenceRule).toBeUndefined();
    expect(createdInput.title).toBe("Stand-up, moved");
    const [seriesId, seriesInput] = (
      transport.replaceEvent as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [string, ProductEventInput];
    expect(seriesId).toBe("series");
    expect(seriesInput.recurrenceRule).toBe("FREQ=DAILY");
    expect(seriesInput.recurrenceExceptions).toHaveLength(1);
  });

  it("keeps a video call on the event until someone removes it", async () => {
    const conference = {
      provider: "skydirect" as const,
      id: "fmYTdnEKrcwM",
      joinUrl: "https://app.example.test/direct/fmYTdnEKrcwM/",
    };
    const transport = transportWith({}, [timedEvent({ conference })]);
    renderWorkspace(transport);

    const dialog = await openEvent("Planning review");
    const link = within(dialog).getByRole("link", {
      name: "Join the video call",
    });
    expect(link.getAttribute("href")).toBe(conference.joinUrl);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(transport.replaceEvent).toHaveBeenCalledTimes(1),
    );
    const [, input] = (transport.replaceEvent as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, ProductEventInput];
    expect(input.conference).toBeNull();
  });

  it("creates, renames and deletes a calendar", async () => {
    const transport = transportWith();
    renderWorkspace(transport);

    fireEvent.click(await screen.findByRole("button", { name: "Calendar" }));
    let dialog = await screen.findByRole("dialog", { name: "New calendar" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Personal" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(transport.createCalendar).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Personal", timeZone: "UTC" }),
      ),
    );
    await screen.findByRole("button", { name: "Personal" });

    fireEvent.click(screen.getByRole("button", { name: "Edit calendar Team" }));
    dialog = await screen.findByRole("dialog", { name: "Edit calendar" });
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Crew" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(transport.updateCalendar).toHaveBeenCalledWith(
        calendar.id,
        expect.objectContaining({ name: "Crew" }),
      ),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit calendar Crew" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Edit calendar" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(transport.deleteCalendar).toHaveBeenCalledWith(calendar.id),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Crew" })).toBeNull(),
    );
  });

  it("hides a calendar's events without forgetting them", async () => {
    const transport = transportWith({}, [timedEvent()]);
    renderWorkspace(transport);

    await screen.findByRole("button", { name: /Planning review/ });
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(
      screen.queryByRole("button", { name: /Planning review/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(
      screen.getByRole("button", { name: /Planning review/ }),
    ).toBeTruthy();
    expect(transport.listEvents).toHaveBeenCalledTimes(1);
  });

  it("offers a real retry after a failed load", async () => {
    const listEvents = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([timedEvent()]);
    const onError = vi.fn();
    renderWorkspace(transportWith({ listEvents }), { onError });

    await screen.findByRole("alert");
    expect(onError).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: /Planning review/ });
    expect(listEvents).toHaveBeenCalledTimes(2);
  });

  it("delegates the composer to the host with what it needs to lay itself out", async () => {
    const seen: SkyCalendarEventComposerRenderProps[] = [];
    function HostComposer(props: SkyCalendarEventComposerRenderProps) {
      seen.push(props);
      return (
        <section aria-label="Host panel">
          <button type="button" onClick={props.onClose}>
            Close host panel
          </button>
        </section>
      );
    }
    renderWorkspace(transportWith(), { eventComposer: HostComposer });

    fireEvent.click(await screen.findByRole("button", { name: /New event/ }));
    await screen.findByRole("region", { name: "Host panel" });
    expect(seen.at(-1)).toMatchObject({
      compact: false,
      editable: true,
      error: "",
    });
    expect(seen.at(-1)?.draft.id).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close host panel" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Host panel" })).toBeNull(),
    );
  });
});
