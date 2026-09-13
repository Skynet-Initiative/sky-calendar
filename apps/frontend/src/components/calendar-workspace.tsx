"use client";

import {
  SkyCalendarWorkspace,
  type ProductCalendar,
  type ProductEvent,
  type ProductEventInput,
  type SkyCalendarTransport,
} from "@skynet-initiative/sky-calendar/product";

const calendars: ProductCalendar[] = [];
const events: ProductEvent[] = [];

const transport: SkyCalendarTransport = {
  async listCalendars() {
    return [...calendars];
  },
  async createCalendar(input) {
    const calendar = { id: crypto.randomUUID(), ...input };
    calendars.push(calendar);
    return calendar;
  },
  async listEvents(from, to) {
    return events.filter((event) => event.start < to && event.end > from);
  },
  async createEvent(calendarId, input) {
    const event = productEvent(crypto.randomUUID(), calendarId, input);
    events.push(event);
    return event;
  },
  async replaceEvent(eventId, input) {
    const index = events.findIndex((event) => event.id === eventId);
    const current = events[index];
    if (!current) throw new Error("Event not found");
    const event = productEvent(eventId, current.calendarId, input);
    events[index] = event;
    return event;
  },
  async deleteEvent(eventId) {
    const index = events.findIndex((event) => event.id === eventId);
    if (index >= 0) events.splice(index, 1);
  },
};

export function CalendarWorkspace() {
  return <SkyCalendarWorkspace transport={transport} locale="fr" />;
}

function productEvent(
  id: string,
  calendarId: string,
  input: ProductEventInput,
): ProductEvent {
  return {
    id,
    calendarId,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    timeZone: input.timeZone,
    recurrenceRule: input.recurrenceRule ?? null,
    recurrenceExceptions: input.recurrenceExceptions ?? [],
    status: input.status,
    visibility: input.visibility,
    attendees: input.attendees,
  };
}
