/**
 * The headless product layer: the data types a host transports, and the
 * draft/period arithmetic a calendar screen needs. No component lives here;
 * the screen belongs to the host, built with the host's own design system,
 * on top of the views exported by the main entry.
 */
export {
  type ProductAttendee,
  type ProductCalendar,
  type ProductCalendarInput,
  type ProductConference,
  type ProductEvent,
  type ProductEventInput,
  type ProductEventReplacement,
} from "./types";
export {
  AGENDA_DAYS,
  CALENDAR_COLORS,
  COMPACT_WEEK_DAYS,
  DEFAULT_CALENDAR_COLOR,
  DRAFT_EVENT_ID,
  changeDraftField,
  draftErrorMessage,
  draftFromEvent,
  emptyDraft,
  eventsAfterDelete,
  eventsAfterMove,
  eventsAfterSave,
  eventsWithDraft,
  eventInput,
  inputFromDraft,
  isProvisionalEvent,
  moveCursor,
  moveSeriesInput,
  nextCalendarColor,
  parseAttendees,
  periodTitle,
  provisionalEventId,
  roundUpToSlot,
  scheduleLabel,
  statusColorsFor,
  toCalendarEvent,
  toInstant,
  visiblePeriod,
  type SkyCalendarCalendarDraft,
  type SkyCalendarEventDraft,
  type SkyCalendarEventDraftField,
  type SkyCalendarView,
  type VisiblePeriod,
} from "./model";
export {
  dateKey,
  instantFromLocalInput,
  localInputFromInstant,
  wallDateFromInstant,
} from "./zoned-time";
