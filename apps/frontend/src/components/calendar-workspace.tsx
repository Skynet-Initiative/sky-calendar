"use client";

import {
  SkyCalendarWorkspace,
  type ProductCalendar,
  type ProductEvent,
  type ProductEventInput,
  type SkyCalendarTransport,
} from "@skynet-initiative/sky-calendar/product";

/**
 * The reference console keeps everything in memory: it shows the product
 * surface, not a backend. Reloading the page starts over.
 */
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
  async updateCalendar(calendarId, input) {
    const index = calendars.findIndex((calendar) => calendar.id === calendarId);
    const current = calendars[index];
    if (!current) throw new Error("Calendar not found");
    const calendar = { ...current, ...input };
    calendars[index] = calendar;
    return calendar;
  },
  async deleteCalendar(calendarId) {
    const index = calendars.findIndex((calendar) => calendar.id === calendarId);
    if (index >= 0) calendars.splice(index, 1);
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i]?.calendarId === calendarId) events.splice(i, 1);
    }
  },
  async listEvents(from, to) {
    return events.filter(
      (event) =>
        (event.start < to && event.end > from) ||
        (event.recurrenceRule !== null && event.start < to),
    );
  },
  async exportEvents() {
    return [...events];
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
    const event = productEvent(
      eventId,
      input.calendarId ?? current.calendarId,
      input,
    );
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
    conference: input.conference ?? null,
  };
}
