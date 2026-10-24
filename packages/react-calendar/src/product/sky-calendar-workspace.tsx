"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type MouseEvent,
} from "react";
import { CalAgendaView } from "../components/agenda-view/agenda-view";
import { CalMonthView } from "../components/month-view/month-view";
import { CalTimeGridView } from "../components/time-grid-view/time-grid-view";
import type { ZonedDateTime } from "../core/date-adapter/zoned-date-time";
import type { CalendarEvent } from "../core/model/calendar-event";
import { DateFnsDateAdapter } from "../date-fns/date-fns-adapter";
import { eventsToCsv } from "../export/csv-export";
import { eventsToIcs } from "../export/ics-export";
import type { EventChange } from "../interactions/event-change";
import { CalendarProvider } from "../provider/calendar-provider";
import { RruleRecurrenceAdapter } from "../recurrence/rrule-adapter";
import type { CalTokenBridge } from "../theme/apply-theme";
import type { CalThemeMode } from "../theme/derive-theme";
import {
  BuiltInCalendarComposer,
  BuiltInEventComposer,
} from "./built-in-composers";
import {
  changeDraftField,
  DAY_MS,
  DEFAULT_CALENDAR_COLOR,
  draftErrorMessage,
  draftFromEvent,
  emptyDraft,
  eventInput,
  inputFromDraft,
  moveSeriesInput,
  roundUpToSlot,
  scheduleLabel,
  statusColorsFor,
  toCalendarEvent,
  type SkyCalendarCalendarDraft,
  type SkyCalendarEventDraft,
  type SkyCalendarEventDraftField,
} from "./model";
import type {
  ProductCalendar,
  ProductEvent,
  SkyCalendarTransport,
} from "./types";
import { useCompact } from "./use-compact";

export type SkyCalendarView = "month" | "week" | "day" | "agenda";

export interface SkyCalendarWorkspaceProps {
  transport: SkyCalendarTransport;
  /** IANA zone the calendar is displayed in. Defaults to the browser's. */
  timeZone?: string;
  locale?: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn?: number;
  onError?: (error: unknown) => void;
  /** Keep calendar data readable while removing every mutation affordance. */
  editable?: boolean;
  /** Export actions. Off for hosts that offer them elsewhere, or not at all. */
  showSecondaryActions?: boolean;
  /** The view shown first on a wide box; a narrow box always starts in Agenda. */
  initialView?: SkyCalendarView;
  eventComposer?: ComponentType<SkyCalendarEventComposerRenderProps>;
  calendarComposer?: ComponentType<SkyCalendarCalendarComposerRenderProps>;
  themeMode?: CalThemeMode;
  baseColor?: string;
  accentColor?: string;
  /** `--cal-*` tokens deferred to the host's own CSS variables. */
  tokenBridge?: CalTokenBridge;
}

export interface SkyCalendarEventComposerRenderProps {
  calendars: readonly ProductCalendar[];
  draft: Readonly<SkyCalendarEventDraft>;
  /** `false` shows the event without letting anyone change it. */
  editable: boolean;
  error: string;
  saving: boolean;
  scheduleLabel: string;
  /** The workspace is narrow: a host composer should take the bottom of the screen. */
  compact: boolean;
  onChange: <Field extends SkyCalendarEventDraftField>(
    field: Field,
    value: SkyCalendarEventDraft[Field],
  ) => void;
  onClose: () => void;
  onDelete: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export interface SkyCalendarCalendarComposerRenderProps {
  draft: Readonly<SkyCalendarCalendarDraft>;
  error: string;
  saving: boolean;
  compact: boolean;
  onChange: (field: "name" | "color", value: string) => void;
  onClose: () => void;
  /** Deletes the calendar and every event in it. */
  onDelete: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export type {
  SkyCalendarCalendarDraft,
  SkyCalendarEventDraft,
  SkyCalendarEventDraftField,
};

const VIEWS: readonly { value: SkyCalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];
const SLOT_MINUTES = 30;
const AGENDA_DAYS = 14;
const COMPACT_WEEK_DAYS = 3;
const MESSAGE_MS = 4_000;
const FIRST_VISIBLE_HOUR = 7;

const dates = new DateFnsDateAdapter();
const recurrence = new RruleRecurrenceAdapter();

export function SkyCalendarWorkspace({
  transport,
  timeZone = hostZone(),
  locale,
  weekStartsOn = 1,
  onError,
  editable = true,
  showSecondaryActions = true,
  initialView = "month",
  eventComposer: EventComposer = BuiltInEventComposer,
  calendarComposer: CalendarComposer = BuiltInCalendarComposer,
  themeMode = "light",
  baseColor,
  accentColor,
  tokenBridge,
}: SkyCalendarWorkspaceProps) {
  const root = useRef<HTMLElement>(null);
  const compact = useCompact(root);
  const [chosenView, setChosenView] = useState<SkyCalendarView | null>(null);
  // A narrow box starts in Agenda, the one view that reads at a glance on a
  // phone, until the person picks a view themselves.
  const view = chosenView ?? (compact ? "agenda" : initialView);
  const [cursor, setCursor] = useState(() => new Date());
  const [calendars, setCalendars] = useState<ProductCalendar[]>([]);
  const [events, setEvents] = useState<ProductEvent[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  // The period whose data is on screen. While it lags behind the period on
  // display, the workspace is busy and says so, without hiding what it has.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<SkyCalendarEventDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [calendarDraft, setCalendarDraft] =
    useState<SkyCalendarCalendarDraft | null>(null);
  const [calendarError, setCalendarError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const opener = useRef<HTMLElement | null>(null);

  const period = useMemo(
    () => visiblePeriod(cursor, view, compact, timeZone, weekStartsOn),
    [compact, cursor, timeZone, view, weekStartsOn],
  );

  const periodKey = `${period.from.toISOString()}|${period.to.toISOString()}|${reloadKey}`;
  const busy = loadedKey !== periodKey;

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
      })
      .catch((error: unknown) => {
        if (!live) return;
        setLoadFailed(true);
        onError?.(error);
      })
      .finally(() => {
        if (!live) return;
        setLoading(false);
        setLoadedKey(periodKey);
      });
    return () => {
      live = false;
    };
  }, [onError, period.from, period.to, periodKey, reloadKey, transport]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const timeGrid = view === "week" || view === "day";
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // A day starts at midnight in the grid, but nobody's day does: open on
  // the morning, once per period, unless the person already scrolled.
  useEffect(() => {
    if (!timeGrid || loading) return;
    const grid = root.current?.querySelector<HTMLElement>(".cal-tg");
    if (grid && grid.scrollTop === 0) {
      grid.scrollTop = (grid.scrollHeight * FIRST_VISIBLE_HOUR) / 24;
    }
  }, [loading, period.from, timeGrid]);

  function setView(next: SkyCalendarView) {
    setChosenView(next);
  }

  function report(error: unknown, fallback: string) {
    setMessage(fallback);
    onError?.(error);
  }

  const visibleEvents = useMemo(
    () =>
      events
        .filter((event) => !hidden.has(event.calendarId))
        .map((event) => toCalendarEvent(event, editable)),
    [editable, events, hidden],
  );
  const statusColors = useMemo(() => statusColorsFor(calendars), [calendars]);

  // ── events ────────────────────────────────────────────────────────────────

  async function ensureCalendar(): Promise<ProductCalendar> {
    const existing = calendars[0];
    if (existing) return existing;
    const created = await transport.createCalendar({
      name: "Calendar",
      color: DEFAULT_CALENDAR_COLOR,
      timeZone,
    });
    setCalendars([created]);
    return created;
  }

  function openCreate(start: Date, end: Date, allDay = false) {
    if (!editable) return;
    setCalendarDraft(null);
    setDraftError("");
    setDraft(
      emptyDraft({
        calendarId:
          calendars.find((c) => !hidden.has(c.id))?.id ??
          calendars[0]?.id ??
          "",
        start,
        end,
        allDay,
        timeZone,
      }),
    );
  }

  function handleCreateNow(event: MouseEvent<HTMLButtonElement>) {
    opener.current = event.currentTarget;
    const start = roundUpToSlot(new Date(), timeZone, SLOT_MINUTES);
    openCreate(start, new Date(start.getTime() + 3_600_000));
  }

  function openEvent(event: CalendarEvent<ProductEvent>) {
    const product = event.meta;
    if (!product) return;
    opener.current = document.activeElement as HTMLElement | null;
    setCalendarDraft(null);
    setDraftError("");
    setDraft(
      draftFromEvent(
        product,
        event.recurrenceId
          ? {
              start: toInstant(event.start),
              end: toInstant(event.end ?? event.start),
            }
          : null,
      ),
    );
  }

  function closeDraft() {
    setDraft(null);
    opener.current?.focus();
    opener.current = null;
  }

  const changeDraft = useCallback(
    <Field extends SkyCalendarEventDraftField>(
      field: Field,
      value: SkyCalendarEventDraft[Field],
    ) => {
      setDraft((current) =>
        current ? changeDraftField(current, field, value) : current,
      );
    },
    [],
  );

  function upsert(saved: ProductEvent) {
    setEvents((current) => [
      ...current.filter((item) => item.id !== saved.id),
      saved,
    ]);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || !draft || !draft.title.trim() || saving) return;
    const master = draft.id
      ? (events.find((item) => item.id === draft.id) ?? null)
      : null;
    let input;
    try {
      input = inputFromDraft(draft, master);
    } catch (error) {
      setDraftError(draftErrorMessage(error));
      return;
    }
    setDraftError("");
    setSaving(true);
    try {
      const calendar =
        calendars.find((item) => item.id === draft.calendarId) ??
        (await ensureCalendar());
      if (master && draft.occurrenceStart && draft.scope === "occurrence") {
        // One occurrence becomes its own event; the series forgets that date.
        const detached = await transport.createEvent(calendar.id, {
          ...input,
          recurrenceRule: undefined,
          recurrenceExceptions: [],
        });
        let series: ProductEvent;
        try {
          series = await transport.replaceEvent(
            master.id,
            eventInput(master, new Date(master.start), new Date(master.end), [
              ...new Set([
                ...master.recurrenceExceptions,
                draft.occurrenceStart,
              ]),
            ]),
          );
        } catch (error) {
          await transport.deleteEvent(detached.id).catch(() => undefined);
          throw error;
        }
        upsert(series);
        upsert(detached);
      } else if (master) {
        const body = draft.occurrenceStart
          ? moveSeriesInput(master, input, draft.occurrenceStart)
          : input;
        const saved = await transport.replaceEvent(master.id, {
          ...body,
          ...(calendar.id !== master.calendarId
            ? { calendarId: calendar.id }
            : {}),
        });
        upsert(saved);
      } else {
        upsert(await transport.createEvent(calendar.id, input));
      }
      closeDraft();
      setMessage(master ? "Event updated." : "Event created.");
    } catch (error) {
      setDraftError("The event could not be saved.");
      onError?.(error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft() {
    if (!editable || !draft?.id || saving) return;
    const master = events.find((item) => item.id === draft.id);
    if (!master) return;
    setSaving(true);
    try {
      if (draft.occurrenceStart && draft.scope === "occurrence") {
        upsert(
          await transport.replaceEvent(
            master.id,
            eventInput(master, new Date(master.start), new Date(master.end), [
              ...new Set([
                ...master.recurrenceExceptions,
                draft.occurrenceStart,
              ]),
            ]),
          ),
        );
      } else {
        await transport.deleteEvent(master.id);
        setEvents((current) => current.filter((item) => item.id !== master.id));
      }
      closeDraft();
      setMessage("Event deleted.");
    } catch (error) {
      report(error, "The event could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  /** A drag or a resize in the grid: the same event, new instants. */
  async function commitChange(change: EventChange<ProductEvent>) {
    if (!editable) return;
    if (change.kind === "create") {
      if (change.start && change.end) {
        openCreate(toInstant(change.start), toInstant(change.end));
      }
      return;
    }
    const master = change.event?.meta;
    if (!master || !change.start || !change.end) return;
    const start = toInstant(change.start);
    const end = toInstant(change.end);
    try {
      if (change.event?.recurrenceId) {
        const occurrenceStart = toInstant(change.event.start).toISOString();
        const detached = await transport.createEvent(master.calendarId, {
          ...eventInput(master, start, end, []),
          recurrenceRule: undefined,
        });
        try {
          upsert(
            await transport.replaceEvent(
              master.id,
              eventInput(master, new Date(master.start), new Date(master.end), [
                ...new Set([...master.recurrenceExceptions, occurrenceStart]),
              ]),
            ),
          );
        } catch (error) {
          await transport.deleteEvent(detached.id).catch(() => undefined);
          throw error;
        }
        upsert(detached);
      } else {
        upsert(
          await transport.replaceEvent(
            master.id,
            eventInput(master, start, end),
          ),
        );
      }
      setMessage("Event moved.");
    } catch (error) {
      report(error, "The event could not be moved.");
    }
  }

  // ── calendars ─────────────────────────────────────────────────────────────

  function openCalendarComposer(
    event: MouseEvent<HTMLButtonElement>,
    calendar: ProductCalendar | null,
  ) {
    if (!editable) return;
    opener.current = event.currentTarget;
    setDraft(null);
    setCalendarError("");
    setCalendarDraft(
      calendar
        ? { id: calendar.id, name: calendar.name, color: calendar.color }
        : { id: null, name: "", color: nextColor(calendars) },
    );
  }

  function closeCalendarComposer() {
    setCalendarDraft(null);
    opener.current?.focus();
    opener.current = null;
  }

  const changeCalendarDraft = useCallback(
    (field: "name" | "color", value: string) => {
      setCalendarDraft((current) =>
        current ? { ...current, [field]: value } : current,
      );
    },
    [],
  );

  async function saveCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || !calendarDraft || saving) return;
    const name = calendarDraft.name.trim();
    if (!name) {
      setCalendarError("Give the calendar a name.");
      return;
    }
    setCalendarError("");
    setSaving(true);
    try {
      if (calendarDraft.id) {
        const saved = await transport.updateCalendar(calendarDraft.id, {
          name,
          color: calendarDraft.color,
        });
        setCalendars((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
        setMessage("Calendar updated.");
      } else {
        const created = await transport.createCalendar({
          name,
          color: calendarDraft.color,
          timeZone,
        });
        setCalendars((current) => [...current, created]);
        setMessage("Calendar created.");
      }
      closeCalendarComposer();
    } catch (error) {
      setCalendarError("The calendar could not be saved.");
      onError?.(error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCalendar() {
    if (!editable || !calendarDraft?.id || saving) return;
    const id = calendarDraft.id;
    setSaving(true);
    try {
      await transport.deleteCalendar(id);
      setCalendars((current) => current.filter((item) => item.id !== id));
      setEvents((current) => current.filter((item) => item.calendarId !== id));
      closeCalendarComposer();
      setMessage("Calendar deleted.");
    } catch (error) {
      setCalendarError("The calendar could not be deleted.");
      onError?.(error);
    } finally {
      setSaving(false);
    }
  }

  function toggleCalendar(id: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── navigation ────────────────────────────────────────────────────────────

  function step(direction: -1 | 1) {
    setCursor((current) =>
      moveCursor(current, view, compact, timeZone, direction),
    );
  }

  function goToday() {
    setCursor(new Date());
  }

  function retryLoad() {
    setLoading(true);
    setLoadFailed(false);
    setReloadKey((current) => current + 1);
  }

  async function exportAs(format: "ics" | "csv") {
    setSaving(true);
    try {
      const all = await transport.exportEvents();
      const exportable = all.map((item) => ({
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
      downloadFile(
        ics
          ? eventsToIcs(exportable, { zone: timeZone })
          : eventsToCsv(exportable),
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

  // ── render ────────────────────────────────────────────────────────────────

  const title = periodTitle(period, view, locale, timeZone);
  const todayVisible = now >= period.from && now < period.to;
  const themeProps = {
    themeMode,
    statusColors,
    ...(baseColor ? { baseColor } : {}),
    ...(accentColor ? { accentColor } : {}),
  };
  const viewProps = {
    events: visibleEvents,
    viewDate: period.viewDate,
    today: now,
    timezone: timeZone,
    locale: locale ?? null,
    weekStartsOn,
    eventClicked: ({ event }: { event: CalendarEvent<ProductEvent> }) =>
      openEvent(event),
    ...themeProps,
  };

  return (
    <CalendarProvider
      dateAdapter={dates}
      recurrenceAdapter={recurrence}
      {...(tokenBridge ? { tokenBridge } : {})}
      defaults={{
        ...(locale ? { locale } : {}),
        weekStartsOn,
        timezone: timeZone,
        slotMinutes: SLOT_MINUTES,
        snapMinutes: 15,
      }}
    >
      <section
        className={[
          "skycal",
          compact ? "skycal--compact" : "",
          busy && !loading ? "skycal--busy" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-labelledby="skycal-title"
        aria-busy={busy}
        ref={root}
      >
        <header className="skycal__header">
          <div className="skycal__nav">
            <button
              className="skycal__icon-button"
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous period"
            >
              <Chevron direction="left" />
            </button>
            <button
              className="skycal__icon-button"
              type="button"
              onClick={() => step(1)}
              aria-label="Next period"
            >
              <Chevron direction="right" />
            </button>
            <h1 id="skycal-title" className="skycal__title">
              {title}
            </h1>
            <button
              className="skycal__button skycal__button--quiet"
              type="button"
              onClick={goToday}
              hidden={todayVisible}
            >
              Today
            </button>
          </div>
          <div className="skycal__actions">
            <div
              className="skycal__segmented"
              role="group"
              aria-label="Calendar view"
            >
              {VIEWS.map((item) => (
                <button
                  key={item.value}
                  className="skycal__segment"
                  type="button"
                  aria-pressed={view === item.value}
                  onClick={() => setView(item.value)}
                >
                  {compact && item.value === "week" ? "3 days" : item.label}
                </button>
              ))}
            </div>
            {showSecondaryActions ? (
              <div className="skycal__secondary">
                <button
                  className="skycal__button skycal__button--quiet"
                  type="button"
                  onClick={() => void exportAs("ics")}
                  disabled={saving}
                >
                  Export ICS
                </button>
                <button
                  className="skycal__button skycal__button--quiet"
                  type="button"
                  onClick={() => void exportAs("csv")}
                  disabled={saving}
                >
                  Export CSV
                </button>
              </div>
            ) : null}
            {editable ? (
              <button
                className="skycal__button skycal__button--primary skycal__new"
                type="button"
                onClick={handleCreateNow}
              >
                <Plus />
                <span>New event</span>
              </button>
            ) : null}
          </div>
        </header>

        {calendars.length > 0 || editable ? (
          <div
            className="skycal__calendars"
            role="group"
            aria-label="Calendars"
          >
            {calendars.map((calendar) => {
              const shown = !hidden.has(calendar.id);
              return (
                <span key={calendar.id} className="skycal__calendar">
                  <button
                    type="button"
                    className="skycal__calendar-toggle"
                    aria-pressed={shown}
                    onClick={() => toggleCalendar(calendar.id)}
                    style={
                      {
                        "--calendar-color": calendar.color,
                      } as React.CSSProperties
                    }
                  >
                    <span className="skycal__dot" aria-hidden="true" />
                    <span className="skycal__calendar-name">
                      {calendar.name}
                    </span>
                  </button>
                  {editable ? (
                    <button
                      type="button"
                      className="skycal__calendar-edit"
                      aria-label={`Edit calendar ${calendar.name}`}
                      onClick={(event) => openCalendarComposer(event, calendar)}
                    >
                      <Pencil />
                    </button>
                  ) : null}
                </span>
              );
            })}
            {editable ? (
              <button
                type="button"
                className="skycal__calendar-add"
                onClick={(event) => openCalendarComposer(event, null)}
              >
                <Plus />
                <span>Calendar</span>
              </button>
            ) : null}
          </div>
        ) : null}

        <p className="skycal__notice" role="status" aria-live="polite">
          {message}
        </p>

        {loading ? (
          <p className="skycal__state" role="status">
            Loading calendar…
          </p>
        ) : loadFailed ? (
          <div className="skycal__state" role="alert">
            <strong>Calendar unavailable</strong>
            <span>
              Your events are unchanged. Check your connection and try again.
            </span>
            <button
              className="skycal__button"
              type="button"
              onClick={retryLoad}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="skycal__body">
            {view === "month" ? (
              <CalMonthView
                {...viewProps}
                maxLanes={compact ? 2 : 4}
                daySelected={({ date }) => {
                  setCursor(toInstant(date));
                  setView("day");
                }}
              />
            ) : null}
            {timeGrid ? (
              <CalTimeGridView
                {...viewProps}
                days={view === "day" ? 1 : compact ? COMPACT_WEEK_DAYS : 7}
                anchorToWeek={view === "week" && !compact}
                now={now}
                editable={editable}
                inlineEdit={false}
                density={compact ? "compact" : "comfortable"}
                slotSelected={({ date }) => {
                  const start = toInstant(date);
                  openCreate(
                    start,
                    new Date(start.getTime() + SLOT_MINUTES * 60_000),
                  );
                }}
                eventChanged={(change) => void commitChange(change)}
              />
            ) : null}
            {view === "agenda" ? (
              <CalAgendaView {...viewProps} days={AGENDA_DAYS} hideEmptyDays />
            ) : null}
            {!busy && events.length === 0 && view === "agenda" ? (
              <p className="skycal__empty">
                {editable
                  ? "Nothing planned. Tap New event to add something."
                  : "Nothing planned in this period."}
              </p>
            ) : null}
          </div>
        )}

        {draft ? (
          <EventComposer
            calendars={calendars}
            draft={draft}
            editable={editable}
            error={draftError}
            saving={saving}
            scheduleLabel={scheduleLabel(draft, locale)}
            compact={compact}
            onChange={changeDraft}
            onClose={closeDraft}
            onDelete={() => void deleteDraft()}
            onSubmit={(event) => void saveDraft(event)}
          />
        ) : null}
        {calendarDraft ? (
          <CalendarComposer
            draft={calendarDraft}
            error={calendarError}
            saving={saving}
            compact={compact}
            onChange={changeCalendarDraft}
            onClose={closeCalendarComposer}
            onDelete={() => void deleteCalendar()}
            onSubmit={(event) => void saveCalendar(event)}
          />
        ) : null}
      </section>
    </CalendarProvider>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

interface Period {
  from: Date;
  to: Date;
  viewDate: Date;
}

function visiblePeriod(
  cursor: Date,
  view: SkyCalendarView,
  compact: boolean,
  zone: string,
  weekStartsOn: number,
): Period {
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

function moveCursor(
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

function periodTitle(
  period: Period,
  view: SkyCalendarView,
  locale: string | undefined,
  timeZone: string,
): string {
  const last = new Date(period.to.getTime() - DAY_MS);
  if (view === "month") {
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
  const range = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
  return range.formatRange(period.from, last);
}

function toInstant(value: Date | ZonedDateTime): Date {
  return value instanceof Date ? value : new Date(value.epochMs);
}

function nextColor(calendars: readonly ProductCalendar[]): string {
  const used = new Set(calendars.map((calendar) => calendar.color));
  return (
    [
      "#2563eb",
      "#16a34a",
      "#db2777",
      "#ea580c",
      "#7c3aed",
      "#0d9488",
      "#ca8a04",
    ].find((color) => !used.has(color)) ?? DEFAULT_CALENDAR_COLOR
  );
}

function hostZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function downloadFile(contents: string, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={
          direction === "left"
            ? "M12.5 4.5 7 10l5.5 5.5"
            : "M7.5 4.5 13 10l-5.5 5.5"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Plus() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 4v12M4 10h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Pencil() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m4 13.5 8.5-8.5 2.5 2.5-8.5 8.5H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
