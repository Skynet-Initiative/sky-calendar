import {
  Controller,
  Delete,
  Headers,
  HttpCode,
  Param,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { Public } from "./auth.js";
import { CalendarService } from "./calendar/calendar.service.js";

@Public()
@Controller("control/workspaces")
export class ControlController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly config: ConfigService,
  ) {}

  @Delete(":workspaceId")
  @HttpCode(204)
  async deleteWorkspace(
    @Param("workspaceId") workspaceId: string,
    @Headers("authorization") authorization?: string,
  ): Promise<void> {
    this.authorize(authorization);
    await this.calendar.deleteWorkspace(workspaceId);
  }

  private authorize(authorization?: string): void {
    const expected = this.config.get<string>("CONTROL_PLANE_TOKEN")?.trim();
    if (!expected)
      throw new ServiceUnavailableException("Control plane is not configured");
    const provided = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const left = Buffer.from(expected);
    const right = Buffer.from(provided);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException("Unauthorized");
    }
  }
}
