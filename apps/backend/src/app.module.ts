import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PlatformAuthGuard } from "./auth.js";
import { CalendarController } from "./calendar/calendar.controller.js";
import { CalendarService } from "./calendar/calendar.service.js";
import { validateEnv } from "./config/env.schema.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ limit: 120, ttl: 60_000 }]),
  ],
  controllers: [HealthController, CalendarController],
  providers: [
    CalendarService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PlatformAuthGuard },
  ],
})
export class AppModule {}
