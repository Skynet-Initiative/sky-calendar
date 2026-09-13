export interface ProductCalendar {
  id: string;
  name: string;
  color: string;
  timeZone: string;
}

export interface ProductEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  recurrenceRule: string | null;
  recurrenceExceptions: string[];
  status: "confirmed" | "tentative" | "cancelled";
  visibility: "default" | "public" | "private";
  attendees: ProductAttendee[];
}

export interface ProductAttendee {
  email: string;
  displayName?: string | undefined;
  response: "needs-action" | "accepted" | "declined" | "tentative";
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
}

export interface SkyCalendarTransport {
  listCalendars(): Promise<ProductCalendar[]>;
  createCalendar(input: {
    name: string;
    color: string;
    timeZone: string;
  }): Promise<ProductCalendar>;
  listEvents(from: string, to: string): Promise<ProductEvent[]>;
  createEvent(
    calendarId: string,
    input: ProductEventInput,
  ): Promise<ProductEvent>;
  replaceEvent(
    eventId: string,
    input: ProductEventInput,
  ): Promise<ProductEvent>;
  deleteEvent(eventId: string): Promise<void>;
}
