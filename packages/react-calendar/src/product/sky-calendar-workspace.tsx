"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import type {
  ProductCalendar,
  ProductEvent,
  ProductEventInput,
  SkyCalendarTransport,
} from "./types";

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
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [calendars, setCalendars] = useState<ProductCalendar[]>([]);
  const [events, setEvents] = useState<ProductEvent[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [calendarDraft, setCalendarDraft] = useState("");
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const calendarDialogRef = useRef<HTMLDialogElement>(null);
  const draggedId = useRef<string | null>(null);
  const period = useMemo(() => visiblePeriod(cursor, view), [cursor, view]);

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
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!live) return;
        setMessage("Calendar data could not be loaded.");
        onError?.(error);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [onError, period.from, period.to, transport]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (draft && dialog && !dialog.open) dialog.showModal();
    if (!draft && dialog?.open) dialog.close();
  }, [draft]);

  useEffect(() => {
    const dialog = calendarDialogRef.current;
    if (calendarDialogOpen && dialog && !dialog.open) dialog.showModal();
    if (!calendarDialogOpen && dialog?.open) dialog.close();
  }, [calendarDialogOpen]);

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
      start: localInput(normalizedStart),
      end: localInput(end),
      allDay,
      location: "",
      description: "",
      recurrenceRule: "",
      attendees: "",
    });
  }

  function handleCreateNow() {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    openCreate(now);
  }

  function openCalendarDialog() {
    setCalendarDraft("");
    setCalendarDialogOpen(true);
  }

  function closeCalendarDialog() {
    setCalendarDialogOpen(false);
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
      setCalendarDialogOpen(false);
      setMessage("Calendar created.");
    } catch (error) {
      report(error, "The calendar could not be created.");
    } finally {
      setSaving(false);
    }
  }

  function changeCalendarName(event: FormEvent<HTMLInputElement>) {
    setCalendarDraft(event.currentTarget.value);
  }

  function handleSlotClick(event: MouseEvent<HTMLButtonElement>) {
    const value = event.currentTarget.dataset.start;
    if (value)
      openCreate(
        new Date(value),
        event.currentTarget.dataset.allDay === "true",
      );
  }

  function handleEventClick(event: MouseEvent<HTMLButtonElement>) {
    const item = events.find(
      (candidate) => candidate.id === event.currentTarget.dataset.eventId,
    );
    if (!item) return;
    setDraftError("");
    setDraft({
      id: item.id,
      calendarId: item.calendarId,
      title: item.title,
      start: localInput(new Date(item.start)),
      end: localInput(new Date(item.end)),
      allDay: item.allDay,
      location: item.location ?? "",
      description: item.description ?? "",
      recurrenceRule: item.recurrenceRule ?? "",
      attendees: item.attendees.map((attendee) => attendee.email).join(", "),
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
    setCursor(startOfDay(new Date()));
  }

  function closeDraft() {
    setDraft(null);
  }

  function handleDialogClose() {
    setDraft(null);
  }

  function handleDraftChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    )
      return;
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
    if (Date.parse(draft.start) >= Date.parse(draft.end)) {
      setDraftError("The end must be after the start.");
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
      const input = draftInput(draft, timeZone);
      const saved = draft.id
        ? await transport.replaceEvent(draft.id, input)
        : await transport.createEvent(calendar.id, input);
      setEvents((current) => [
        ...current.filter((item) => item.id !== saved.id),
        saved,
      ]);
      setDraft(null);
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
      await transport.deleteEvent(draft.id);
      setEvents((current) => current.filter((item) => item.id !== draft.id));
      setDraft(null);
      setMessage("Event deleted.");
    } catch (error) {
      report(error, "The event could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    draggedId.current = event.currentTarget.dataset.eventId ?? null;
    if (draggedId.current)
      event.dataTransfer.setData("text/plain", draggedId.current);
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const id = draggedId.current ?? event.dataTransfer.getData("text/plain");
    const startValue = event.currentTarget.dataset.start;
    const item = events.find((candidate) => candidate.id === id);
    if (!item || !startValue) return;
    const oldStart = new Date(item.start);
    const newStart = new Date(startValue);
    if (event.currentTarget.dataset.preserveTime === "true") {
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    }
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
      draggedId.current = null;
    }
  }

  const days = viewDays(cursor, view);
  const title = periodTitle(cursor, view, locale);

  return (
    <section className="skycal" aria-labelledby="skycal-title">
      <header className="skycal__header">
        <div>
          <p className="skycal__eyebrow">Sky Calendar</p>
          <h1 id="skycal-title">{title}</h1>
        </div>
        <div className="skycal__primary-actions">
          <button
            className="skycal__button"
            type="button"
            onClick={openCalendarDialog}
          >
            New calendar
          </button>
          <button
            className="skycal__button skycal__button--primary"
            type="button"
            onClick={handleCreateNow}
          >
            New event
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
      {!loading && view === "month" ? (
        <Month
          days={days}
          events={events}
          locale={locale}
          onSlotClick={handleSlotClick}
          onEventClick={handleEventClick}
          onDragStart={handleDragStart}
          onDragOver={allowDrop}
          onDrop={handleDrop}
        />
      ) : null}
      {!loading && (view === "week" || view === "day") ? (
        <TimeGrid
          days={days}
          events={events}
          locale={locale}
          onSlotClick={handleSlotClick}
          onEventClick={handleEventClick}
          onDragStart={handleDragStart}
          onDragOver={allowDrop}
          onDrop={handleDrop}
        />
      ) : null}
      {!loading && view === "agenda" ? (
        <Agenda
          events={events}
          locale={locale}
          onEventClick={handleEventClick}
        />
      ) : null}
      <dialog
        className="skycal__dialog"
        ref={dialogRef}
        onClose={handleDialogClose}
        aria-labelledby="skycal-dialog-title"
        aria-describedby={draftError ? "skycal-form-error" : undefined}
      >
        {draft ? (
          <form
            className="skycal__form"
            onSubmit={saveDraft}
            onChange={handleDraftChange}
          >
            <div className="skycal__dialog-heading">
              <h2 id="skycal-dialog-title">
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
            <div className="skycal__form-row">
              <label className="skycal__field">
                <span>Starts</span>
                <input
                  name="start"
                  type="datetime-local"
                  value={draft.start}
                  required
                />
              </label>
              <label className="skycal__field">
                <span>Ends</span>
                <input
                  name="end"
                  type="datetime-local"
                  value={draft.end}
                  required
                />
              </label>
            </div>
            <label className="skycal__check">
              <input name="allDay" type="checkbox" checked={draft.allDay} />
              All day
            </label>
            {calendars.length > 1 ? (
              <label className="skycal__field">
                <span>Calendar</span>
                <select name="calendarId" value={draft.calendarId}>
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <details className="skycal__details">
              <summary>More options</summary>
              <label className="skycal__field">
                <span>Location</span>
                <input name="location" value={draft.location} maxLength={500} />
              </label>
              <label className="skycal__field">
                <span>Description</span>
                <textarea
                  name="description"
                  value={draft.description}
                  maxLength={10000}
                  rows={3}
                />
              </label>
              <label className="skycal__field">
                <span>Repeat</span>
                <select name="recurrenceRule" value={draft.recurrenceRule}>
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
        ) : null}
      </dialog>
      <dialog
        className="skycal__dialog"
        ref={calendarDialogRef}
        onClose={closeCalendarDialog}
        aria-labelledby="skycal-calendar-dialog-title"
      >
        <form className="skycal__form" onSubmit={saveCalendar}>
          <div className="skycal__dialog-heading">
            <h2 id="skycal-calendar-dialog-title">New calendar</h2>
            <button
              className="skycal__icon-button"
              type="button"
              onClick={closeCalendarDialog}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <label className="skycal__field">
            <span>Name</span>
            <input
              value={calendarDraft}
              onInput={changeCalendarName}
              maxLength={100}
              required
              autoFocus
            />
          </label>
          <div className="skycal__form-actions">
            <button
              className="skycal__button"
              type="button"
              onClick={closeCalendarDialog}
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
      </dialog>
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
  ...handlers
}: {
  days: Date[];
  events: ProductEvent[];
  locale?: string;
} & CalendarHandlers) {
  return (
    <div className="skycal__month" role="group" aria-label="Month view">
      {weekdays(locale).map((day) => (
        <div className="skycal__weekday" key={day}>
          {day}
        </div>
      ))}
      {days.map((day) => {
        const items = eventsForDay(events, day);
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
              <time dateTime={dateKey(day)}>{day.getDate()}</time>
            </button>
            <div className="skycal__day-events">
              {items.slice(0, 4).map((item) => (
                <EventButton
                  item={item}
                  key={item.id}
                  onClick={handlers.onEventClick}
                  onDragStart={handlers.onDragStart}
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
  ...handlers
}: {
  days: Date[];
  events: ProductEvent[];
  locale?: string;
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
            {formatWeekday(day, locale)} <strong>{day.getDate()}</strong>
          </div>
        ))}
        {HOURS.map((hour) => (
          <TimeRow
            hour={hour}
            days={days}
            events={events}
            key={hour}
            handlers={handlers}
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
}: {
  hour: number;
  days: Date[];
  events: ProductEvent[];
  handlers: CalendarHandlers;
}) {
  return (
    <>
      <div className="skycal__hour">{String(hour).padStart(2, "0")}:00</div>
      {days.map((day) => {
        const start = atHour(day, hour);
        const items = events.filter((item) =>
          sameHour(new Date(item.start), start),
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
                key={item.id}
                onClick={handlers.onEventClick}
                onDragStart={handlers.onDragStart}
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
}: {
  item: ProductEvent;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className="skycal__event"
      type="button"
      draggable
      data-event-id={item.id}
      data-status={item.status}
      onClick={onClick}
      onDragStart={onDragStart}
    >
      <span>{item.title}</span>
      <time dateTime={item.start}>{formatTime(new Date(item.start))}</time>
    </button>
  );
}

function Agenda({
  events,
  locale,
  onEventClick,
}: {
  events: ProductEvent[];
  locale?: string;
  onEventClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  if (!sorted.length)
    return <p className="skycal__state">No events in this period.</p>;
  return (
    <ol className="skycal__agenda">
      {sorted.map((item) => (
        <li key={item.id}>
          <time dateTime={item.start}>
            {new Intl.DateTimeFormat(locale, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: item.allDay ? undefined : "2-digit",
              minute: item.allDay ? undefined : "2-digit",
            }).format(new Date(item.start))}
          </time>
          <button type="button" data-event-id={item.id} onClick={onEventClick}>
            <strong>{item.title}</strong>
            {item.location ? <span>{item.location}</span> : null}
          </button>
        </li>
      ))}
    </ol>
  );
}

function draftInput(draft: Draft, timeZone: string): ProductEventInput {
  const attendees = draft.attendees
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email, response: "needs-action" as const }));
  return {
    title: draft.title.trim(),
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.location ? { location: draft.location } : {}),
    start: new Date(draft.start).toISOString(),
    end: new Date(draft.end).toISOString(),
    allDay: draft.allDay,
    timeZone,
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
    recurrenceExceptions: item.recurrenceExceptions,
    status: item.status,
    visibility: item.visibility,
    attendees: item.attendees,
  };
}

function visiblePeriod(cursor: Date, view: View) {
  if (view === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
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

function viewDays(cursor: Date, view: View): Date[] {
  const period = visiblePeriod(cursor, view);
  const count = view === "month" ? 42 : view === "week" ? 7 : 1;
  return Array.from(
    { length: count },
    (_, index) => new Date(period.from.getTime() + index * DAY_MS),
  );
}

function moveCursor(cursor: Date, view: View, direction: number): Date {
  const next = new Date(cursor);
  if (view === "month") next.setMonth(next.getMonth() + direction);
  else
    next.setDate(
      next.getDate() +
        direction * (view === "week" ? 7 : view === "agenda" ? 31 : 1),
    );
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}
function atHour(day: Date, hour: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
}
function sameHour(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours()
  );
}
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localInput(date: Date): string {
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function eventsForDay(events: ProductEvent[], day: Date): ProductEvent[] {
  const key = dateKey(day);
  return events.filter((item) => dateKey(new Date(item.start)) === key);
}
function weekdays(locale?: string): string[] {
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, index) =>
    formatWeekday(new Date(monday.getTime() + index * DAY_MS), locale),
  );
}
function formatWeekday(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
}
function formatDay(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}
function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function periodTitle(date: Date, view: View, locale?: string): string {
  return new Intl.DateTimeFormat(
    locale,
    view === "day" ? { dateStyle: "long" } : { month: "long", year: "numeric" },
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
