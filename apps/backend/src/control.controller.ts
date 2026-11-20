import {
  BadRequestException,
  Body,
  type CanActivate,
  Controller,
  Delete,
  type ExecutionContext,
  HttpCode,
  Injectable,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from "class-validator";
import type { FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { Public, RESOURCE_PATTERN } from "./auth.js";
import {
  type CalendarMove,
  CalendarService,
} from "./calendar/calendar.service.js";

/**
 * The platform's control plane — not a user's token, but the dedicated
 * `CONTROL_PLANE_TOKEN`. A guard, so that it answers before anything reads the
 * request: a caller without the token learns nothing, not even what a valid
 * body looks like.
 */
@Injectable()
export class ControlPlaneGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("CONTROL_PLANE_TOKEN")?.trim();
    if (!expected)
      throw new ServiceUnavailableException("Control plane is not configured");
    const authorization = context.switchToHttp().getRequest<FastifyRequest>()
      .headers.authorization;
    const provided = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const left = Buffer.from(expected);
    const right = Buffer.from(provided);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException("Unauthorized");
    }
    return true;
  }
}

/** The calendars a move names: the platform lists them first, and journals them. */
export class MoveCalendarsDto {
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((id) => (typeof id === "string" ? id.toLowerCase() : id))
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  calendarIds!: string[];
}

@Public()
@UseGuards(ControlPlaneGuard)
@Controller("control/workspaces")
export class ControlController {
  constructor(private readonly calendar: CalendarService) {}

  @Delete(":workspaceId")
  @HttpCode(204)
  async deleteWorkspace(
    @Param("workspaceId") workspaceId: string,
  ): Promise<void> {
    await this.calendar.deleteWorkspace(workspaceId);
  }

  /**
   * Moves the named calendars of `from` into `to`, with their events — a
   * project's calendars into its organization's workspace, or back. Replaying
   * it changes nothing.
   */
  @Post(":from/move-to/:to")
  @HttpCode(200)
  moveCalendars(
    @Param("from") from: string,
    @Param("to") to: string,
    @Body() body: MoveCalendarsDto,
  ): Promise<CalendarMove> {
    if (!RESOURCE_PATTERN.test(from) || !RESOURCE_PATTERN.test(to)) {
      throw new BadRequestException("Invalid workspace id");
    }
    if (from === to)
      throw new BadRequestException("A move needs two different workspaces");
    return this.calendar.moveCalendars(from, to, body.calendarIds);
  }
}
