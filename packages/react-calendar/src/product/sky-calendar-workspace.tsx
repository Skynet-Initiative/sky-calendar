"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { rrulestr } from "rrule";
import { eventsToCsv } from "../export/csv-export";
import { eventsToIcs } from "../export/ics-export";
import type {
  ProductCalendar,
  ProductEvent,
  ProductEventInput,
  SkyCalendarTransport,
} from "./types";
import {
  dateKey,
  instantFromLocalInput,
  instantFromWallDate,
  localInputFromInstant,
  localInputFromWallDate,
  wallDateFromInstant,
} from "./zoned-time";

type View = "month" | "week" | "day" | "agenda";

export interface SkyCalendarWorkspaceProps {
  transport: SkyCalendarTransport;
  timeZone?: string;
  locale?: string;
  onError?: (error: unknown) => void;
}

interface Draft {
  id: string | null;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  recurrenceRule: string;
  attendees: string;
  timeZone: string;
  occurrenceStart: string | null;
  scope: "occurrence" | "series";
}

interface DisplayEvent extends ProductEvent {
  instanceKey: string;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const VIEWS: readonly View[] = ["month", "week", "day", "agenda"];

export function SkyCalendarWorkspace({
  transport,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  locale,
  onError,
}: SkyCalendarWorkspaceProps) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() =>
    startOfDay(wallDateFromInstant(new Date(), timeZone)),
  );
  const [calendars, setCalendars] = useState<ProductCalendar[]>([]);
  const [events, setEvents] = useState<ProductEvent[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [calendarDraft, setCalendarDraft] = useState("");
  const [calendarComposerOpen, setCalendarComposerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const draftOpenerRef = useRef<HTMLButtonElement | null>(null);
  const calendarOpenerRef = useRef<HTMLButtonElement | null>(null);
  const draftComposerRef = useRef<HTMLElement | null>(null);
  const calendarComposerRef = useRef<HTMLElement | null>(null);
  const draggedKey = useRef<string | null>(null);
  const draftOpen = draft !== null;
  const period = useMemo(
    () => visiblePeriod(cursor, view, timeZone),
    [cursor, timeZone, view],
  );

  useEffect(() => {
    let live = true;
    Promise.all([
      transport.listCalendars(),
      transport.listEvents(period.from.toISOString(), period.to.toISOString()),
    ])
      .then(([nextCalendars, nextEvents]) => {
        if (!live) return;
        setCalendars(nextCalendars);
        setEvents(nextEvents);
        setLoadFailed(false);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!live) return;
        setLoadFailed(true);
        setMessage("");
        onError?.(error);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [onError, period.from, period.to, reloadKey, transport]);

  useEffect(() => {
    if (!draftOpen && !calendarComposerOpen) return;

    function handleOutsidePointer(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (
        draftOpen &&
        !draftComposerRef.current?.contains(event.target) &&
        !draftOpenerRef.current?.contains(event.target)
      ) {
        setDraft(null);
      }
      if (
        calendarComposerOpen &&
        !calendarComposerRef.current?.contains(event.target) &&
        !calendarOpenerRef.current?.contains(event.target)
      ) {
        setCalendarComposerOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [calendarComposerOpen, draftOpen]);

  function report(error: unknown, fallback: string) {
    setMessage(fallback);
    onError?.(error);
  }

  async function ensureCalendar(): Promise<ProductCalendar> {
    const existing = calendars[0];
    if (existing) return existing;
    const created = await transport.createCalendar({
      name: "Calendar",
      color: "#2563eb",
      timeZone,
    });
    setCalendars([created]);
    return created;
  }

  function openCreate(start: Date, allDay = false) {
    setCalendarComposerOpen(false);
    setDraftError("");
    const normalizedStart = allDay ? startOfDay(start) : start;
    const calendarId = calendars[0]?.id ?? "";
    const end = new Date(
      normalizedStart.getTime() + (allDay ? DAY_MS : HOUR_MS),
    );
    setDraft({
      id: null,
      calendarId,
      title: "",
      start: localInputFromWallDate(normalizedStart),
      end: localInputFromWallDate(end),
      allDay,
      location: "",
      description: "",
      recurrenceRule: "",
      attendees: "",
      timeZone,
      occurrenceStart: null,
      scope: "series",
    });
  }

  function handleCreateNow(event: MouseEvent<HTMLButtonElement>) {
    draftOpenerRef.current = event.currentTarget;
    const now = wallDateFromInstant(new Date(), timeZone);
    now.setUTCMinutes(Math.ceil(now.getUTCMinutes() / 15) * 15, 0, 0);
    openCreate(now);
  }

  function openCalendarComposer(event: MouseEvent<HTMLButtonElement>) {
    calendarOpenerRef.current = event.currentTarget;
    setDraft(null);
    setCalendarDraft("");
    setCalendarComposerOpen(true);
  }

  function closeCalendarComposer() {
    setCalendarComposerOpen(false);
    calendarOpenerRef.current?.focus();
  }

  function handleCalendarComposerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeCalendarComposer();
  }

  async function saveCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!calendarDraft.trim() || saving) return;
    setSaving(true);
    try {
      const created = await transport.createCalendar({
        name: calendarDraft.trim(),
        color: "#2563eb",
        timeZone,
      });
      setCalendars((current) => [...current, created]);
      closeCalendarComposer();
      setMessage("Calendar created.");
    } catch (error) {
      report(error, "The calendar could not be created.");
    } finally {
      setSaving(false);
    }
  }

  function changeCalendarName(event: ChangeEvent<HTMLInputElement>) {
    setCalendarDraft(event.currentTarget.value);
  }

  function handleSlotClick(event: MouseEvent<HTMLButtonElement>) {
    const value = event.currentTarget.dataset.start;
    if (value) {
      draftOpenerRef.current = event.currentTarget;
      openCreate(
        new Date(value),
        event.currentTarget.dataset.allDay === "true",
      );
    }
  }

  function handleEventClick(event: MouseEvent<HTMLButtonElement>) {
    const instanceKey = event.currentTarget.dataset.instanceKey;
    const item = displayEvents.find(
      (candidate) => candidate.instanceKey === instanceKey,
    );
    if (!item) return;
    draftOpenerRef.current = event.currentTarget;
    setCalendarComposerOpen(false);
    setDraftError("");
    setDraft({
      id: item.id,
      calendarId: item.calendarId,
      title: item.title,
      start: localInputFromInstant(new Date(item.start), item.timeZone),
      end: localInputFromInstant(new Date(item.end), item.timeZone),
      allDay: item.allDay,
      location: item.location ?? "",
      description: item.description ?? "",
      recurrenceRule: item.recurrenceRule ?? "",
      attendees: item.attendees.map((attendee) => attendee.email).join(", "),
      timeZone: item.timeZone,
      occurrenceStart: item.recurrenceRule ? item.start : null,
      scope: item.recurrenceRule ? "occurrence" : "series",
    });
  }

  function handleView(event: MouseEvent<HTMLButtonElement>) {
    const value = event.currentTarget.value as View;
    if (VIEWS.includes(value)) setView(value);
  }

  function previous() {
    setCursor((current) => moveCursor(current, view, -1));
  }

  function next() {
    setCursor((current) => moveCursor(current, view, 1));
  }

  function today() {
    setCursor(startOfDay(wallDateFromInstant(new Date(), timeZone)));
  }

  function retryLoad() {
    setLoading(true);
    setLoadFailed(false);
    setReloadKey((current) => current + 1);
  }

  function closeDraft() {
    setDraft(null);
    draftOpenerRef.current?.focus();
  }

  function handleDraftComposerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeDraft();
  }

  function handleDraftChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) {
    const target = event.currentTarget;
    setDraft((current) => {
      if (!current) return current;
      const value =
        target instanceof HTMLInputElement && target.type === "checkbox"
          ? target.checked
          : target.value;
      return { ...current, [target.name]: value };
    });
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.title.trim() || saving) return;
    let input: ProductEventInput;
    try {
      input = draftInput(draft);
      if (Date.parse(input.start) >= Date.parse(input.end)) {
        setDraftError("The end must be after the start.");
        return;
      }
    } catch {
      setDraftError(
        "This local time does not exist in the selected time zone.",
      );
      return;
    }
    if (!validAttendees(draft.attendees)) {
      setDraftError("Enter valid guest email addresses separated by commas.");
      return;
    }
    setDraftError("");
    setSaving(true);
    try {
      const calendar = draft.calendarId
        ? (calendars.find((item) => item.id === draft.calendarId) ??
          (await ensureCalendar()))
        : await ensureCalendar();
      if (draft.id && draft.occurrenceStart && draft.scope === "occurrence") {
        const master = events.find((item) => item.id === draft.id);
        if (!master) throw new Error("Recurring event master not found");
        const saved = await transport.createEvent(calendar.id, {
          ...input,
          recurrenceRule: undefined,
          recurrenceExceptions: [],
        });
        let exception: ProductEvent;
        try {
          exception = await transport.replaceEvent(
            master.id,
            eventInput(master, new Date(master.start), new Date(master.end), [
              ...new Set([
                ...master.recurrenceExceptions,
                draft.occurrenceStart,
              ]),
            ]),
          );
        } catch (error) {
          await transport.deleteEvent(saved.id).catch(() => undefined);
          throw error;
        }
        setEvents((current) => [
          ...current.filter((item) => item.id !== exception.id),
          exception,
          saved,
        ]);
      } else {
        const master = draft.id
          ? events.find((item) => item.id === draft.id)
          : undefined;
        const seriesInput =
          master && draft.occurrenceStart
            ? moveSeriesInput(master, input, draft.occurrenceStart)
            : input;
        const saved = draft.id
          ? await transport.replaceEvent(draft.id, seriesInput)
          : await transport.createEvent(calendar.id, seriesInput);
        setEvents((current) => [
          ...current.filter((item) => item.id !== saved.id),
          saved,
        ]);
      }
      closeDraft();
      setMessage(draft.id ? "Event updated." : "Event created.");
    } catch (error) {
      setDraftError("The event could not be saved.");
      report(error, "The event could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft() {
    if (!draft?.id || saving) return;
    setSaving(true);
    try {
      if (draft.occurrenceStart && draft.scope === "occurrence") {
        const master = events.find((item) => item.id === draft.id);
        if (!master) throw new Error("Recurring event master not found");
        const saved = await transport.replaceEvent(
          master.id,
          eventInput(master, new Date(master.start), new Date(master.end), [
            ...master.recurrenceExceptions,
            draft.occurrenceStart,
          ]),
        );
        setEvents((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
      } else {
        await transport.deleteEvent(draft.id);
        setEvents((current) => current.filter((item) => item.id !== draft.id));
      }
      closeDraft();
      setMessage("Event deleted.");
    } catch (error) {
      report(error, "The event could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    draggedKey.current = event.currentTarget.dataset.instanceKey ?? null;
    if (draggedKey.current)
      event.dataTransfer.setData("text/plain", draggedKey.current);
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const instanceKey =
      draggedKey.current ?? event.dataTransfer.getData("text/plain");
    const startValue = event.currentTarget.dataset.start;
    const item = displayEvents.find(
      (candidate) => candidate.instanceKey === instanceKey,
    );
    if (!item || !startValue) return;
    if (item.recurrenceRule) {
      setMessage(
        "Open a repeating event to choose this occurrence or the series.",
      );
      draggedKey.current = null;
      return;
    }
    const oldStart = new Date(item.start);
    const newWallStart = new Date(startValue);
    if (event.currentTarget.dataset.preserveTime === "true") {
      const oldWallStart = wallDateFromInstant(oldStart, timeZone);
      newWallStart.setUTCHours(
        oldWallStart.getUTCHours(),
        oldWallStart.getUTCMinutes(),
        0,
        0,
      );
    }
    const newStart = instantFromWallDate(newWallStart, timeZone);
    const duration = new Date(item.end).getTime() - oldStart.getTime();
    const input = eventInput(
      item,
      newStart,
      new Date(newStart.getTime() + duration),
    );
    try {
      const saved = await transport.replaceEvent(item.id, input);
      setEvents((current) =>
        current.map((candidate) =>
          candidate.id === saved.id ? saved : candidate,
        ),
      );
      setMessage("Event moved.");
    } catch (error) {
      report(error, "The event could not be moved.");
    } finally {
      draggedKey.current = null;
    }
  }

  async function exportEvents(event: MouseEvent<HTMLButtonElement>) {
    const format = event.currentTarget.value === "csv" ? "csv" : "ics";
    setSaving(true);
    try {
      const allEvents = await transport.exportEvents();
      const exportable = allEvents.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description ?? undefined,
        location: item.location ?? undefined,
        attendees: item.attendees.map((attendee) => attendee.email),
        visibility: item.visibility,
        start: new Date(item.start),
        end: new Date(item.end),
        allDay: item.allDay,
        timeZone: item.timeZone,
        status: item.status,
        recurrenceRule: item.recurrenceRule ?? undefined,
        recurrenceExceptions: item.recurrenceExceptions.map(
          (value) => new Date(value),
        ),
      }));
      const ics = format === "ics";
      const contents = ics
        ? eventsToIcs(exportable, { zone: timeZone })
        : eventsToCsv(exportable);
      downloadFile(
        contents,
        ics ? "text/calendar;charset=utf-8" : "text/csv;charset=utf-8",
        `sky-calendar.${format}`,
      );
      setMessage(`Calendar exported as ${format.toUpperCase()}.`);
    } catch (error) {
      report(error, "The calendar could not be exported.");
    } finally {
      setSaving(false);
    }
  }

  const days = viewDays(cursor, view);
  const title = periodTitle(cursor, view, locale);
  const displayEvents = expandRecurrences(events, period.from, period.to);

  return (
    <section className="skycal" aria-labelledby="skycal-title">
      <header className="skycal__header">
        <div>
          <h1 id="skycal-title">{title}</h1>
        </div>
        <div className="skycal__primary-actions">
          <button
            className="skycal__button skycal__button--primary"
            type="button"
            onClick={handleCreateNow}
          >
            New event
          </button>
          <button
            className="skycal__button"
            type="button"
            onClick={openCalendarComposer}
          >
            New calendar
          </button>
          <button
            className="skycal__button"
            type="button"
            value="ics"
            onClick={exportEvents}
            disabled={saving}
          >
            Export ICS
          </button>
          <button
            className="skycal__button"
            type="button"
            value="csv"
            onClick={exportEvents}
            disabled={saving}
          >
            Export CSV
          </button>
        </div>
      </header>
      <div className="skycal__toolbar" aria-label="Calendar controls">
        <div className="skycal__button-group">
          <button
            className="skycal__icon-button"
            type="button"
            onClick={previous}
            aria-label="Previous period"
          >
            ‹
          </button>
          <button className="skycal__button" type="button" onClick={today}>
            Today
          </button>
          <button
            className="skycal__icon-button"
            type="button"
            onClick={next}
            aria-label="Next period"
          >
            ›
          </button>
        </div>
        <div className="skycal__button-group" aria-label="View">
          {VIEWS.map((item) => (
            <button
              className="skycal__button"
              type="button"
              key={item}
              value={item}
              aria-pressed={view === item}
              onClick={handleView}
            >
              {capitalize(item)}
            </button>
          ))}
        </div>
      </div>
      {message ? (
        <p className="skycal__notice" role="status">
          {message}
        </p>
      ) : null}
      {loading ? (
        <p className="skycal__state" role="status">
          Loading calendar…
        </p>
      ) : null}
      {!loading && loadFailed ? (
        <div className="skycal__state" role="alert">
          <strong>Calendar unavailable</strong>
          <span>
            Your events are unchanged. Check your connection and try again.
          </span>
          <button className="skycal__button" type="button" onClick={retryLoad}>
            Try again
          </button>
        </div>
      ) : null}
      {!loading && !loadFailed && view === "month" ? (
        <Month
          days={days}
          events={displayEvents}
          locale={locale}
          timeZone={timeZone}
          onSlotClick={handleSlotClick}
          onEventClick={handleEventClick}
          onDragStart={handleDragStart}
          onDragOver={allowDrop}
          onDrop={handleDrop}
        />
      ) : null}
      {!loading && !loadFailed && (view === "week" || view === "day") ? (
        <TimeGrid
          days={days}
          events={displayEvents}
          locale={locale}
          timeZone={timeZone}
          onSlotClick={handleSlotClick}
          onEventClick={handleEventClick}
          onDragStart={handleDragStart}
          onDragOver={allowDrop}
          onDrop={handleDrop}
        />
      ) : null}
      {!loading && !loadFailed && view === "agenda" ? (
        <Agenda
          events={displayEvents}
          locale={locale}
          timeZone={timeZone}
          onEventClick={handleEventClick}
        />
      ) : null}
      {draft ? (
        <aside
          className="skycal__composer"
          ref={draftComposerRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="skycal-event-composer-title"
          aria-describedby={draftError ? "skycal-form-error" : undefined}
          onKeyDown={handleDraftComposerKeyDown}
        >
          <form className="skycal__form" onSubmit={saveDraft}>
            <div className="skycal__composer-heading">
              <h2 id="skycal-event-composer-title">
                {draft.id ? "Edit event" : "New event"}
              </h2>
              <button
                className="skycal__icon-button"
                type="button"
                onClick={closeDraft}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label className="skycal__field skycal__field--wide">
              <span>Title</span>
              <input
                name="title"
                value={draft.title}
                onChange={handleDraftChange}
                placeholder="Add title"
                maxLength={300}
                required
                autoFocus
              />
            </label>
            {draftError ? (
              <p
                className="skycal__form-error"
                id="skycal-form-error"
                role="alert"
              >
                {draftError}
              </p>
            ) : null}
            <p className="skycal__schedule">
              <time dateTime={draft.start}>
                {draftScheduleLabel(draft, locale)}
              </time>
            </p>
            <details className="skycal__details">
              <summary>Date, time &amp; more options</summary>
              <div className="skycal__form-row">
                <label className="skycal__field">
                  <span>Starts</span>
                  <input
                    name="start"
                    type="datetime-local"
                    value={draft.start}
                    onChange={handleDraftChange}
                    required
                  />
                </label>
                <label className="skycal__field">
                  <span>Ends</span>
                  <input
                    name="end"
                    type="datetime-local"
                    value={draft.end}
                    onChange={handleDraftChange}
                    required
                  />
                </label>
              </div>
              <label className="skycal__check">
                <input
                  name="allDay"
                  type="checkbox"
                  checked={draft.allDay}
                  onChange={handleDraftChange}
                />
                All day
              </label>
              <p className="skycal__field-note">Time zone: {draft.timeZone}</p>
              {calendars.length > 1 ? (
                <label className="skycal__field">
                  <span>Calendar</span>
                  <select
                    name="calendarId"
                    value={draft.calendarId}
                    onChange={handleDraftChange}
                  >
                    {calendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendar.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="skycal__field">
                <span>Location</span>
                <input
                  name="location"
                  value={draft.location}
                  onChange={handleDraftChange}
                  maxLength={500}
                />
              </label>
              {draft.occurrenceStart ? (
                <label className="skycal__field">
                  <span>Apply changes to</span>
                  <select
                    name="scope"
                    value={draft.scope}
                    onChange={handleDraftChange}
                  >
                    <option value="occurrence">This occurrence</option>
                    <option value="series">Entire series</option>
                  </select>
                </label>
              ) : null}
              <label className="skycal__field">
                <span>Description</span>
                <textarea
                  name="description"
                  value={draft.description}
                  onChange={handleDraftChange}
                  maxLength={10000}
                  rows={3}
                />
              </label>
              <label className="skycal__field">
                <span>Repeat</span>
                <select
                  name="recurrenceRule"
                  value={draft.recurrenceRule}
                  onChange={handleDraftChange}
                >
                  <option value="">Does not repeat</option>
                  <option value="FREQ=DAILY">Every day</option>
                  <option value="FREQ=WEEKLY">Every week</option>
                  <option value="FREQ=MONTHLY">Every month</option>
                  <option value="FREQ=YEARLY">Every year</option>
                </select>
              </label>
              <label className="skycal__field">
                <span>Guests</span>
                <input
                  name="attendees"
                  value={draft.attendees}
                  onChange={handleDraftChange}
                  placeholder="name@example.com, …"
                />
              </label>
            </details>
            <div className="skycal__form-actions">
              {draft.id ? (
                <button
                  className="skycal__button skycal__button--danger"
                  type="button"
                  disabled={saving}
                  onClick={deleteDraft}
                >
                  Delete
                </button>
              ) : null}
              <button
                className="skycal__button"
                type="button"
                onClick={closeDraft}
              >
                Cancel
              </button>
              <button
                className="skycal__button skycal__button--primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </aside>
      ) : null}
      {calendarComposerOpen ? (
        <aside
          className="skycal__composer skycal__composer--calendar"
          ref={calendarComposerRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="skycal-calendar-composer-title"
          onKeyDown={handleCalendarComposerKeyDown}
        >
          <form className="skycal__form" onSubmit={saveCalendar}>
            <div className="skycal__composer-heading">
              <h2 id="skycal-calendar-composer-title">New calendar</h2>
              <button
                className="skycal__icon-button"
                type="button"
                onClick={closeCalendarComposer}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label className="skycal__field">
              <span>Name</span>
              <input
                value={calendarDraft}
                onChange={changeCalendarName}
                maxLength={100}
                required
                autoFocus
              />
            </label>
            <div className="skycal__form-actions">
              <button
                className="skycal__button"
                type="button"
                onClick={closeCalendarComposer}
              >
                Cancel
              </button>
              <button
                className="skycal__button skycal__button--primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </aside>
      ) : null}
    </section>
  );
}

interface CalendarHandlers {
  onSlotClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onEventClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

function Month({
  days,
  events,
  locale,
  timeZone,
  ...handlers
}: {
  days: Date[];
  events: DisplayEvent[];
  locale?: string;
  timeZone: string;
} & CalendarHandlers) {
  return (
    <div className="skycal__month" role="group" aria-label="Month view">
      {weekdays(locale).map((day) => (
        <div className="skycal__weekday" key={day}>
          {day}
        </div>
      ))}
      {days.map((day) => {
        const items = eventsForDay(events, day, timeZone);
        return (
          <div
            className="skycal__day"
            key={day.toISOString()}
            data-start={day.toISOString()}
            data-preserve-time="true"
            onDragOver={handlers.onDragOver}
            onDrop={handlers.onDrop}
          >
            <button
              className="skycal__day-target"
              type="button"
              data-start={atHour(day, 9).toISOString()}
              data-all-day="true"
              onClick={handlers.onSlotClick}
              aria-label={`Create event on ${formatDay(day, locale)}`}
            >
              <time dateTime={dateKey(day)}>{day.getUTCDate()}</time>
            </button>
            <div className="skycal__day-events">
              {items.slice(0, 4).map((item) => (
                <EventButton
                  item={item}
                  key={item.instanceKey}
                  onClick={handlers.onEventClick}
                  onDragStart={handlers.onDragStart}
                  timeZone={timeZone}
                />
              ))}
              {items.length > 4 ? (
                <span className="skycal__more">+{items.length - 4} more</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimeGrid({
  days,
  events,
  locale,
  timeZone,
  ...handlers
}: {
  days: Date[];
  events: DisplayEvent[];
  locale?: string;
  timeZone: string;
} & CalendarHandlers) {
  return (
    <div className="skycal__time-scroll">
      <div
        className="skycal__time-grid"
        role="group"
        aria-label="Time grid"
        data-days={days.length}
      >
        <div className="skycal__time-corner" />
        {days.map((day) => (
          <div className="skycal__time-day" key={day.toISOString()}>
            {formatWeekday(day, locale)} <strong>{day.getUTCDate()}</strong>
          </div>
        ))}
        {HOURS.map((hour) => (
          <TimeRow
            hour={hour}
            days={days}
            events={events}
            key={hour}
            handlers={handlers}
            timeZone={timeZone}
          />
        ))}
      </div>
    </div>
  );
}

function TimeRow({
  hour,
  days,
  events,
  handlers,
  timeZone,
}: {
  hour: number;
  days: Date[];
  events: DisplayEvent[];
  handlers: CalendarHandlers;
  timeZone: string;
}) {
  return (
    <>
      <div className="skycal__hour">{String(hour).padStart(2, "0")}:00</div>
      {days.map((day) => {
        const start = atHour(day, hour);
        const items = events.filter((item) =>
          sameHour(wallDateFromInstant(new Date(item.start), timeZone), start),
        );
        return (
          <div
            className="skycal__slot"
            key={start.toISOString()}
            data-start={start.toISOString()}
            onDragOver={handlers.onDragOver}
            onDrop={handlers.onDrop}
          >
            <button
              className="skycal__slot-target"
              type="button"
              data-start={start.toISOString()}
              onClick={handlers.onSlotClick}
              aria-label={`Create event at ${String(hour).padStart(2, "0")}:00`}
            />
            {items.map((item) => (
              <EventButton
                item={item}
                key={item.instanceKey}
                onClick={handlers.onEventClick}
                onDragStart={handlers.onDragStart}
                timeZone={timeZone}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function EventButton({
  item,
  onClick,
  onDragStart,
  timeZone,
}: {
  item: DisplayEvent;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  timeZone: string;
}) {
  return (
    <button
      className="skycal__event"
      type="button"
      draggable={!item.recurrenceRule}
      data-event-id={item.id}
      data-instance-key={item.instanceKey}
      data-status={item.status}
      onClick={onClick}
      onDragStart={onDragStart}
    >
      <span>{item.title}</span>
      <time dateTime={item.start}>
        {formatTime(new Date(item.start), timeZone)}
      </time>
    </button>
  );
}

function Agenda({
  events,
  locale,
  timeZone,
  onEventClick,
}: {
  events: DisplayEvent[];
  locale?: string;
  timeZone: string;
  onEventClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  if (!sorted.length)
    return <p className="skycal__state">No events in this period.</p>;
  return (
    <ol className="skycal__agenda">
      {sorted.map((item) => (
        <li key={item.instanceKey}>
          <time dateTime={item.start}>
            {new Intl.DateTimeFormat(locale, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: item.allDay ? undefined : "2-digit",
              minute: item.allDay ? undefined : "2-digit",
              timeZone,
            }).format(new Date(item.start))}
          </time>
          <button
            type="button"
            data-event-id={item.id}
            data-instance-key={item.instanceKey}
            onClick={onEventClick}
          >
            <strong>{item.title}</strong>
            {item.location ? <span>{item.location}</span> : null}
          </button>
        </li>
      ))}
    </ol>
  );
}

function draftScheduleLabel(draft: Draft, locale?: string): string {
  const start = new Date(`${draft.start}Z`);
  const end = new Date(`${draft.end}Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Choose a date and time";
  }
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const startDate = dateFormatter.format(start);
  if (draft.allDay) {
    const inclusiveEnd = new Date(end.getTime() - DAY_MS);
    const endDate = dateFormatter.format(inclusiveEnd);
    return startDate === endDate
      ? `${startDate} · All day`
      : `${startDate} – ${endDate} · All day`;
  }
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${startDate} · ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
}

function draftInput(draft: Draft): ProductEventInput {
  const attendees = draft.attendees
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email, response: "needs-action" as const }));
  return {
    title: draft.title.trim(),
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.location ? { location: draft.location } : {}),
    start: instantFromLocalInput(draft.start, draft.timeZone).toISOString(),
    end: instantFromLocalInput(draft.end, draft.timeZone).toISOString(),
    allDay: draft.allDay,
    timeZone: draft.timeZone,
    ...(draft.recurrenceRule ? { recurrenceRule: draft.recurrenceRule } : {}),
    recurrenceExceptions: [],
    status: "confirmed",
    visibility: "default",
    attendees,
  };
}

function eventInput(
  item: ProductEvent,
  start: Date,
  end: Date,
  recurrenceExceptions = item.recurrenceExceptions,
): ProductEventInput {
  return {
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    ...(item.location ? { location: item.location } : {}),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: item.allDay,
    timeZone: item.timeZone,
    ...(item.recurrenceRule ? { recurrenceRule: item.recurrenceRule } : {}),
    recurrenceExceptions,
    status: item.status,
    visibility: item.visibility,
    attendees: item.attendees,
  };
}

function visibleWallPeriod(cursor: Date, view: View) {
  if (view === "month") {
    const first = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1),
    );
    const from = startOfWeek(first);
    return { from, to: new Date(from.getTime() + 42 * DAY_MS) };
  }
  if (view === "week") {
    const from = startOfWeek(cursor);
    return { from, to: new Date(from.getTime() + 7 * DAY_MS) };
  }
  const from = startOfDay(cursor);
  return {
    from,
    to: new Date(from.getTime() + (view === "agenda" ? 31 : 1) * DAY_MS),
  };
}

function visiblePeriod(cursor: Date, view: View, timeZone: string) {
  const wall = visibleWallPeriod(cursor, view);
  return {
    from: instantFromWallDate(wall.from, timeZone),
    to: instantFromWallDate(wall.to, timeZone),
  };
}

function viewDays(cursor: Date, view: View): Date[] {
  const period = visibleWallPeriod(cursor, view);
  const count = view === "month" ? 42 : view === "week" ? 7 : 1;
  return Array.from(
    { length: count },
    (_, index) => new Date(period.from.getTime() + index * DAY_MS),
  );
}

function moveCursor(cursor: Date, view: View, direction: number): Date {
  const next = new Date(cursor);
  if (view === "month") next.setUTCMonth(next.getUTCMonth() + direction);
  else
    next.setUTCDate(
      next.getUTCDate() +
        direction * (view === "week" ? 7 : view === "agenda" ? 31 : 1),
    );
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const offset = (result.getUTCDay() + 6) % 7;
  result.setUTCDate(result.getUTCDate() - offset);
  return result;
}
function atHour(day: Date, hour: number): Date {
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour),
  );
}
function sameHour(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate() &&
    a.getUTCHours() === b.getUTCHours()
  );
}
function eventsForDay(
  events: DisplayEvent[],
  day: Date,
  timeZone: string,
): DisplayEvent[] {
  const key = dateKey(day);
  return events.filter(
    (item) =>
      dateKey(wallDateFromInstant(new Date(item.start), timeZone)) === key,
  );
}

function expandRecurrences(
  events: ProductEvent[],
  from: Date,
  to: Date,
): DisplayEvent[] {
  return events.flatMap((event) => {
    if (!event.recurrenceRule) return [{ ...event, instanceKey: event.id }];
    try {
      const wallStart = wallDateFromInstant(
        new Date(event.start),
        event.timeZone,
      );
      const wallEnd = wallDateFromInstant(new Date(event.end), event.timeZone);
      const wallFrom = wallDateFromInstant(from, event.timeZone);
      const wallTo = wallDateFromInstant(to, event.timeZone);
      const rule = rrulestr(event.recurrenceRule.replace(/^RRULE:/, ""), {
        dtstart: wallStart,
      });
      const wallDuration = wallEnd.getTime() - wallStart.getTime();
      const exceptions = new Set(event.recurrenceExceptions);
      return rule
        .between(wallFrom, wallTo, true)
        .slice(0, 1_000)
        .map((wallOccurrence) => {
          const start = instantFromWallDate(wallOccurrence, event.timeZone);
          const end = instantFromWallDate(
            new Date(wallOccurrence.getTime() + wallDuration),
            event.timeZone,
          );
          return {
            ...event,
            start: start.toISOString(),
            end: end.toISOString(),
            instanceKey: `${event.id}:${start.toISOString()}`,
          };
        })
        .filter((occurrence) => !exceptions.has(occurrence.start));
    } catch {
      return [{ ...event, instanceKey: event.id }];
    }
  });
}
function weekdays(locale?: string): string[] {
  const monday = new Date(Date.UTC(2024, 0, 1));
  return Array.from({ length: 7 }, (_, index) =>
    formatWeekday(new Date(monday.getTime() + index * DAY_MS), locale),
  );
}
function formatWeekday(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}
function formatDay(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}
function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
}
function periodTitle(
  date: Date,
  view: View,
  locale: string | undefined,
): string {
  return new Intl.DateTimeFormat(
    locale,
    view === "day"
      ? { dateStyle: "long", timeZone: "UTC" }
      : { month: "long", year: "numeric", timeZone: "UTC" },
  ).format(date);
}
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function validAttendees(value: string): boolean {
  const emails = value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  return emails.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function moveSeriesInput(
  master: ProductEvent,
  edited: ProductEventInput,
  occurrenceStart: string,
): ProductEventInput {
  const offset = Date.parse(edited.start) - Date.parse(occurrenceStart);
  const start = new Date(Date.parse(master.start) + offset);
  const duration = Date.parse(edited.end) - Date.parse(edited.start);
  return {
    ...edited,
    start: start.toISOString(),
    end: new Date(start.getTime() + duration).toISOString(),
    recurrenceExceptions: master.recurrenceExceptions,
  };
}

function downloadFile(contents: string, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
