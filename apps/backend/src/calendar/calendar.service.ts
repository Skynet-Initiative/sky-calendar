import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import type {
  CreateCalendarDto,
  CreateEventDto,
  ReplaceEventDto,
  UpdateCalendarDto,
} from "./calendar.dto.js";

/**
 * Every query carries the workspace in its predicate. Events reach their
 * workspace through their calendar, so each event statement joins or checks
 * `calendar.workspace_id`; an identifier from another workspace behaves
 * exactly like an identifier that does not exist.
 */
@Injectable()
export class CalendarService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  health() {
    return this.pool.query("SELECT 1");
  }

  async listCalendars(workspaceId: string) {
    const result = await this.pool.query(
      `SELECT ${CALENDAR_COLUMNS} FROM calendar
        WHERE workspace_id = $1 ORDER BY created_at ASC`,
      [workspaceId],
    );
    return result.rows as unknown[];
  }

  async createCalendar(workspaceId: string, dto: CreateCalendarDto) {
    assertTimeZone(dto.timeZone);
    const result = await this.pool.query(
      `INSERT INTO calendar (workspace_id, name, color, time_zone)
       VALUES ($1, $2, $3, $4)
       RETURNING ${CALENDAR_COLUMNS}`,
      [workspaceId, dto.name, dto.color, dto.timeZone],
    );
    return result.rows[0];
  }

  async updateCalendar(
    workspaceId: string,
    calendarId: string,
    dto: UpdateCalendarDto,
  ) {
    if (dto.timeZone !== undefined) assertTimeZone(dto.timeZone);
    const result = await this.pool.query(
      `UPDATE calendar
          SET name = COALESCE($3, name),
              color = COALESCE($4, color),
              time_zone = COALESCE($5, time_zone),
              updated_at = now()
        WHERE id = $1 AND workspace_id = $2
        RETURNING ${CALENDAR_COLUMNS}`,
      [
        calendarId,
        workspaceId,
        dto.name ?? null,
        dto.color ?? null,
        dto.timeZone ?? null,
      ],
    );
    if (result.rowCount === 0)
      throw new NotFoundException("Calendar not found");
    return result.rows[0];
  }

  /** Deletes the calendar and, by cascade, every event it holds. */
  async deleteCalendar(workspaceId: string, calendarId: string) {
    const result = await this.pool.query(
      "DELETE FROM calendar WHERE id = $1 AND workspace_id = $2",
      [calendarId, workspaceId],
    );
    if (result.rowCount === 0)
      throw new NotFoundException("Calendar not found");
  }

  async listEvents(workspaceId: string, from: string, to: string) {
    const start = new Date(from);
    const end = new Date(to);
    if (
      !Number.isFinite(start.valueOf()) ||
      !Number.isFinite(end.valueOf()) ||
      start >= end
    ) {
      throw new BadRequestException("Invalid event range");
    }
    if (end.valueOf() - start.valueOf() > 366 * 86_400_000) {
      throw new BadRequestException("Event range cannot exceed 366 days");
    }
    // A recurring series is returned whenever it started before the window:
    // the client expands it and decides which occurrences fall inside.
    const result = await this.pool.query(
      `${EVENT_COLUMNS}
         FROM calendar_event e
         JOIN calendar c ON c.id = e.calendar_id
        WHERE c.workspace_id = $1
          AND ((e.start < $3 AND e."end" > $2)
            OR (e.recurrence_rule IS NOT NULL AND e.start < $3))
        ORDER BY e.start ASC, e.id ASC LIMIT 10000`,
      [workspaceId, start, end],
    );
    return result.rows as unknown[];
  }

  async exportEvents(workspaceId: string, cursor?: string, limit = 25) {
    const result = await this.pool.query(
      `${EVENT_COLUMNS}
         FROM calendar_event e
         JOIN calendar c ON c.id = e.calendar_id
        WHERE c.workspace_id = $1
          AND ($2::uuid IS NULL OR e.id > $2::uuid)
        ORDER BY e.id ASC
        LIMIT $3`,
      [workspaceId, cursor ?? null, limit + 1],
    );
    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit) as { id: string }[];
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async createEvent(
    workspaceId: string,
    calendarId: string,
    dto: CreateEventDto,
  ) {
    const result = await this.pool.query(
      `INSERT INTO calendar_event
         (calendar_id, title, description, location, start, "end", all_day, time_zone,
          recurrence_rule, recurrence_exceptions, status, visibility, attendees, conference)
       SELECT c.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
         FROM calendar c WHERE c.id = $1 AND c.workspace_id = $2
       ${EVENT_RETURNING}`,
      [calendarId, workspaceId, ...eventValues(dto)],
    );
    if (result.rowCount === 0)
      throw new NotFoundException("Calendar not found");
    return result.rows[0];
  }

  async replaceEvent(
    workspaceId: string,
    eventId: string,
    dto: ReplaceEventDto,
  ) {
    if (dto.calendarId !== undefined) {
      const target = await this.pool.query(
        "SELECT 1 FROM calendar WHERE id = $1 AND workspace_id = $2",
        [dto.calendarId, workspaceId],
      );
      if (target.rowCount === 0)
        throw new NotFoundException("Calendar not found");
    }
    const result = await this.pool.query(
      `UPDATE calendar_event e
          SET title = $2, description = $3, location = $4, start = $5, "end" = $6,
              all_day = $7, time_zone = $8, recurrence_rule = $9,
              recurrence_exceptions = $10, status = $11, visibility = $12,
              attendees = $13, conference = $14,
              calendar_id = COALESCE($16, e.calendar_id),
              updated_at = now()
        WHERE e.id = $1 AND EXISTS (
          SELECT 1 FROM calendar c
           WHERE c.id = e.calendar_id AND c.workspace_id = $15
        )
        ${EVENT_RETURNING}`,
      [eventId, ...eventValues(dto), workspaceId, dto.calendarId ?? null],
    );
    if (result.rowCount === 0) throw new NotFoundException("Event not found");
    return result.rows[0];
  }

  async deleteEvent(workspaceId: string, eventId: string) {
    const result = await this.pool.query(
      `DELETE FROM calendar_event e USING calendar c
        WHERE e.id = $1 AND e.calendar_id = c.id AND c.workspace_id = $2`,
      [eventId, workspaceId],
    );
    if (result.rowCount === 0) throw new NotFoundException("Event not found");
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.pool.query("DELETE FROM calendar WHERE workspace_id = $1", [
      workspaceId,
    ]);
  }
}

/** The thirteen event columns, in the order the statements bind them. */
function eventValues(dto: CreateEventDto): unknown[] {
  assertTimeZone(dto.timeZone);
  const start = new Date(dto.start);
  const end = new Date(dto.end);
  if (start >= end)
    throw new BadRequestException("Event end must follow its start");
  return [
    dto.title,
    dto.description ?? null,
    dto.location ?? null,
    start,
    end,
    dto.allDay,
    dto.timeZone,
    dto.recurrenceRule ?? null,
    (dto.recurrenceExceptions ?? []).map((value) => new Date(value)),
    dto.status,
    dto.visibility,
    JSON.stringify(dto.attendees),
    dto.conference ? JSON.stringify(dto.conference) : null,
  ];
}

const CALENDAR_COLUMNS = `id, workspace_id AS "workspaceId", name, color,
  time_zone AS "timeZone", created_at AS "createdAt", updated_at AS "updatedAt"`;
const EVENT_COLUMN_LIST: readonly [column: string, alias?: string][] = [
  ["id"],
  ["calendar_id", "calendarId"],
  ["title"],
  ["description"],
  ["location"],
  ["start"],
  ['"end"'],
  ["all_day", "allDay"],
  ["time_zone", "timeZone"],
  ["recurrence_rule", "recurrenceRule"],
  ["recurrence_exceptions", "recurrenceExceptions"],
  ["status"],
  ["visibility"],
  ["attendees"],
  ["conference"],
  ["created_at", "createdAt"],
  ["updated_at", "updatedAt"],
];
const eventFields = (prefix: string) =>
  EVENT_COLUMN_LIST.map(([column, alias]) =>
    alias ? `${prefix}${column} AS "${alias}"` : `${prefix}${column}`,
  ).join(", ");
const EVENT_COLUMNS = `SELECT ${eventFields("e.")}`;
const EVENT_RETURNING = `RETURNING ${eventFields("")}`;

function assertTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw new BadRequestException("Unknown IANA time zone");
  }
}
