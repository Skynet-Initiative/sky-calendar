import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import type { CreateCalendarDto, CreateEventDto } from "./calendar.dto.js";

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
      `SELECT id, workspace_id AS "workspaceId", name, color, time_zone AS "timeZone",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM calendar WHERE workspace_id = $1 ORDER BY created_at ASC`,
      [workspaceId],
    );
    return result.rows as unknown[];
  }

  async createCalendar(workspaceId: string, dto: CreateCalendarDto) {
    assertTimeZone(dto.timeZone);
    const result = await this.pool.query(
      `INSERT INTO calendar (workspace_id, name, color, time_zone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, workspace_id AS "workspaceId", name, color, time_zone AS "timeZone",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [workspaceId, dto.name, dto.color, dto.timeZone],
    );
    return result.rows[0];
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

  async exportEvents(workspaceId: string) {
    const result = await this.pool.query(
      `${EVENT_COLUMNS}
         FROM calendar_event e
         JOIN calendar c ON c.id = e.calendar_id
        WHERE c.workspace_id = $1
        ORDER BY e.start ASC, e.id ASC`,
      [workspaceId],
    );
    return result.rows as unknown[];
  }

  async createEvent(
    workspaceId: string,
    calendarId: string,
    dto: CreateEventDto,
  ) {
    return this.writeEvent("insert", calendarId, dto, workspaceId);
  }

  async replaceEvent(
    workspaceId: string,
    eventId: string,
    dto: CreateEventDto,
  ) {
    return this.writeEvent("update", eventId, dto, workspaceId);
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

  private async writeEvent(
    kind: "insert" | "update",
    id: string,
    dto: CreateEventDto,
    workspaceId?: string,
  ) {
    assertTimeZone(dto.timeZone);
    const start = new Date(dto.start);
    const end = new Date(dto.end);
    if (start >= end)
      throw new BadRequestException("Event end must follow its start");
    const eventValues = [
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
    ];
    const statement =
      kind === "insert"
        ? `INSERT INTO calendar_event
           (calendar_id, title, description, location, start, "end", all_day, time_zone,
            recurrence_rule, recurrence_exceptions, status, visibility, attendees)
         SELECT c.id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
           FROM calendar c WHERE c.id=$1 AND c.workspace_id=$2 ${EVENT_RETURNING}`
        : `UPDATE calendar_event e SET title=$2, description=$3, location=$4, start=$5, "end"=$6,
            all_day=$7, time_zone=$8, recurrence_rule=$9, recurrence_exceptions=$10,
            status=$11, visibility=$12, attendees=$13, updated_at=now()
          WHERE e.id=$1 AND EXISTS (
            SELECT 1 FROM calendar c
             WHERE c.id=e.calendar_id AND c.workspace_id=$14
          ) ${EVENT_RETURNING}`;
    const values =
      kind === "insert"
        ? [id, workspaceId, ...eventValues]
        : [id, ...eventValues, workspaceId];
    const result = await this.pool.query(statement, values);
    if (result.rowCount === 0) {
      throw new NotFoundException(
        kind === "insert" ? "Calendar not found" : "Event not found",
      );
    }
    return result.rows[0];
  }
}

const EVENT_COLUMNS = `SELECT e.id, e.calendar_id AS "calendarId", e.title, e.description,
  e.location, e.start, e."end", e.all_day AS "allDay", e.time_zone AS "timeZone",
  e.recurrence_rule AS "recurrenceRule", e.recurrence_exceptions AS "recurrenceExceptions",
  e.status, e.visibility, e.attendees, e.created_at AS "createdAt", e.updated_at AS "updatedAt"`;
const EVENT_RETURNING = `RETURNING id, calendar_id AS "calendarId", title, description, location,
  start, "end", all_day AS "allDay", time_zone AS "timeZone",
  recurrence_rule AS "recurrenceRule", recurrence_exceptions AS "recurrenceExceptions",
  status, visibility, attendees, created_at AS "createdAt", updated_at AS "updatedAt"`;

function assertTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw new BadRequestException("Unknown IANA time zone");
  }
}
