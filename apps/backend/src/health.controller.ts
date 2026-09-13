import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { CalendarService } from "./calendar/calendar.service.js";
import { Public } from "./auth.js";

@Controller()
export class HealthController {
  constructor(private readonly database: CalendarService) {}

  @Public()
  @Get("health/live")
  live() {
    return { status: "ok" };
  }

  @Public()
  @Get("health/ready")
  async ready() {
    try {
      await this.database.health();
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("Service unavailable");
    }
  }
}
