export interface ProductCalendar {
  id: string;
  name: string;
  color: string;
  timeZone: string;
}

export interface ProductCalendarInput {
  name: string;
  color: string;
  timeZone: string;
}

export interface ProductAttendee {
  email: string;
  displayName?: string | undefined;
  response: "needs-action" | "accepted" | "declined" | "tentative";
}

/**
 * A video call attached to an event. The calendar stores where to join; the
 * provider decides who may enter and what happens in the room.
 */
export interface ProductConference {
  provider: "skydirect";
  id: string;
  joinUrl: string;
}

export interface ProductEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  /** Exclusive end instant. An all-day event ending on the 3rd ends at the 4th 00:00. */
  end: string;
  allDay: boolean;
  timeZone: string;
  recurrenceRule: string | null;
  recurrenceExceptions: string[];
  status: "confirmed" | "tentative" | "cancelled";
  visibility: "default" | "public" | "private";
  attendees: ProductAttendee[];
  conference: ProductConference | null;
}

export interface ProductEventInput {
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  recurrenceRule?: string;
  recurrenceExceptions?: string[];
  status: ProductEvent["status"];
  visibility: ProductEvent["visibility"];
  attendees: ProductAttendee[];
  conference?: ProductConference | null;
}

/** A replacement may move the event to another calendar of the same workspace. */
export interface ProductEventReplacement extends ProductEventInput {
  calendarId?: string;
}
