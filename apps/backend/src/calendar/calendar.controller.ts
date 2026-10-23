import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth.js";
import { authorize } from "../auth.js";
import {
  CreateCalendarDto,
  CreateEventDto,
  ExportEventsQueryDto,
  ReplaceEventDto,
  UpdateCalendarDto,
} from "./calendar.dto.js";
import { CalendarService } from "./calendar.service.js";


@Controller("workspaces/:workspaceId")
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get("calendars")
  listCalendars(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
  ) {
    requireAction(request, workspaceId, "read");
    return this.service.listCalendars(workspaceId);
  }

  @Post("calendars")
  createCalendar(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateCalendarDto,
  ) {
    requireAction(request, workspaceId, "manage");
    return this.service.createCalendar(workspaceId, body);
  }

  @Patch("calendars/:calendarId")
  updateCalendar(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
    @Param("calendarId", ParseUUIDPipe) calendarId: string,
    @Body() body: UpdateCalendarDto,
  ) {
    requireAction(request, workspaceId, "manage");
    return this.service.updateCalendar(workspaceId, calendarId, body);
  }

  @Delete("calendars/:calendarId")
  @HttpCode(204)
  async deleteCalendar(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
    @Param("calendarId", ParseUUIDPipe) calendarId: string,
  ) {
    requireAction(request, workspaceId, "manage");
    await this.service.deleteCalendar(workspaceId, calendarId);
  }

  @Get("events")
  listEvents(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    requireAction(request, workspaceId, "read");
    return this.service.listEvents(workspaceId, from, to);
  }

  @Get("events/export")
  exportEvents(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
    @Query() query: ExportEventsQueryDto,
  ) {
    requireAction(request, workspaceId, "read");
    return this.service.exportEvents(workspaceId, query.cursor, query.limit);
  }

  @Post("calendars/:calendarId/events")
  createEvent(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
    @Param("calendarId", ParseUUIDPipe) calendarId: string,
    @Body() body: CreateEventDto,
  ) {
    requireAction(request, workspaceId, "manage");
    return this.service.createEvent(workspaceId, calendarId, body);
  }

  @Put("events/:eventId")
  replaceEvent(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() body: ReplaceEventDto,
  ) {
    requireAction(request, workspaceId, "manage");
    return this.service.replaceEvent(workspaceId, eventId, body);
  }

  @Delete("events/:eventId")
  @HttpCode(204)
  async deleteEvent(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") workspaceId: string,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ) {
    requireAction(request, workspaceId, "manage");
    await this.service.deleteEvent(workspaceId, eventId);
  }
}

function requireAction(
  request: AuthenticatedRequest,
  workspaceId: string,
  action: "read" | "manage",
) {
  if (!authorize(request.principal, workspaceId, action))
    throw new ForbiddenException("Forbidden");
}
