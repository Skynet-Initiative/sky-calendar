import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const calendarSchema = z.object({
  id: identifier,
  workspaceId: identifier,
  name: z.string().trim().min(1).max(100),
  color,
  timeZone: z.string().trim().min(1).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const attendeeSchema = z.object({
  email: z.email().max(320),
  displayName: z.string().trim().max(120).optional(),
  response: z.enum(["needs-action", "accepted", "declined", "tentative"]),
});

export const eventSchema = z.object({
  id: identifier,
  calendarId: identifier,
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).nullable(),
  location: z.string().max(500).nullable(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  allDay: z.boolean(),
  timeZone: z.string().trim().min(1).max(100),
  recurrenceRule: z.string().max(2_000).nullable(),
  recurrenceExceptions: z.array(z.iso.datetime()).max(1_000),
  status: z.enum(["confirmed", "tentative", "cancelled"]),
  visibility: z.enum(["default", "public", "private"]),
  attendees: z.array(attendeeSchema).max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const eventRangeSchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .refine(({ from, to }) => Date.parse(from) < Date.parse(to), {
    message: "from must precede to",
  });

export const createCalendarSchema = calendarSchema.pick({
  name: true,
  color: true,
  timeZone: true,
});

export const createEventSchema = eventSchema
  .omit({
    id: true,
    calendarId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    description: z.string().max(10_000).optional(),
    location: z.string().max(500).optional(),
    recurrenceRule: z.string().max(2_000).optional(),
    recurrenceExceptions: z.array(z.iso.datetime()).max(1_000).optional(),
  });

export type Calendar = z.infer<typeof calendarSchema>;
export type CalendarEvent = z.infer<typeof eventSchema>;
export type EventAttendee = z.infer<typeof attendeeSchema>;
export type CreateCalendar = z.infer<typeof createCalendarSchema>;
export type CreateCalendarEvent = z.infer<typeof createEventSchema>;

export interface SkyCalendarClientOptions {
  baseUrl: string;
  getToken: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
}

export function createClient(options: SkyCalendarClientOptions) {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> {
    const token = await options.getToken();
    const response = await (options.fetch ?? globalThis.fetch)(
      `${options.baseUrl}${path}`,
      {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      },
    );
    if (!response.ok)
      throw new Error(`Sky Calendar API returned ${response.status}`);
    return schema.parse(await response.json());
  }

  async function requestWithoutResponse(path: string, init: RequestInit) {
    const token = await options.getToken();
    const response = await (options.fetch ?? globalThis.fetch)(
      `${options.baseUrl}${path}`,
      {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      },
    );
    if (!response.ok)
      throw new Error(`Sky Calendar API returned ${response.status}`);
  }

  const workspacePath = (workspaceId: string) =>
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;

  return {
    listCalendars: (workspaceId: string, signal?: AbortSignal) =>
      request(
        `${workspacePath(workspaceId)}/calendars`,
        z.array(calendarSchema),
        { signal },
      ),
    createCalendar: (workspaceId: string, calendar: CreateCalendar) =>
      request(`${workspacePath(workspaceId)}/calendars`, calendarSchema, {
        method: "POST",
        body: JSON.stringify(createCalendarSchema.parse(calendar)),
      }),
    listEvents: (
      workspaceId: string,
      from: string,
      to: string,
      signal?: AbortSignal,
    ) => {
      const query = new URLSearchParams({ from, to });
      return request(
        `${workspacePath(workspaceId)}/events?${query}`,
        z.array(eventSchema),
        { signal },
      );
    },
    createEvent: (
      workspaceId: string,
      calendarId: string,
      event: CreateCalendarEvent,
    ) =>
      request(
        `${workspacePath(workspaceId)}/calendars/${encodeURIComponent(calendarId)}/events`,
        eventSchema,
        {
          method: "POST",
          body: JSON.stringify(createEventSchema.parse(event)),
        },
      ),
    replaceEvent: (
      workspaceId: string,
      eventId: string,
      event: CreateCalendarEvent,
    ) =>
      request(
        `${workspacePath(workspaceId)}/events/${encodeURIComponent(eventId)}`,
        eventSchema,
        {
          method: "PUT",
          body: JSON.stringify(createEventSchema.parse(event)),
        },
      ),
    deleteEvent: (workspaceId: string, eventId: string, signal?: AbortSignal) =>
      requestWithoutResponse(
        `${workspacePath(workspaceId)}/events/${encodeURIComponent(eventId)}`,
        { method: "DELETE", signal },
      ),
  };
}
