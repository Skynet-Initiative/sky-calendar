import { randomBytes, randomUUID } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CalendarService } from "./calendar/calendar.service.js";
import { ControlPlaneGuard } from "./control.controller.js";

const CONTROL_TOKEN = "calendar-control-token-at-least-32-characters";
const databaseUrl = process.env.DATABASE_URL;

/** The real application, as `main.ts` serves it: guards, pipes, prefix and all. */
let app: NestFastifyApplication;
const environment = { ...process.env };

beforeAll(async () => {
  // Read by the configuration module when the application module is loaded.
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.PLATFORM_MINTER_PUBLIC_KEYS = randomBytes(32).toString("base64");
  process.env.CORS_ORIGIN = "https://calendar.example.test";
  process.env.CONTROL_PLANE_TOKEN = CONTROL_TOKEN;
  const { AppModule } = await import("./app.module.js");
  const { configureApp } = await import("./app.setup.js");
  app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: false },
  );
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  process.env = environment;
});

function control(
  method: "DELETE" | "POST",
  url: string,
  options: { token?: string; payload?: object } = {},
) {
  return app.inject({
    method,
    url: `/api/v1/control/workspaces/${url}`,
    headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  });
}

describe("control plane", () => {
  it("refuses every control route without the control token, before reading the request", async () => {
    const someone = [randomUUID()];
    for (const token of [undefined, "wrong-token", `${CONTROL_TOKEN}x`]) {
      const options = token ? { token } : {};
      expect((await control("DELETE", "cal_a", options)).statusCode).toBe(401);
      expect(
        (
          await control("POST", "cal_a/move-to/cal_b", {
            ...options,
            payload: { calendarIds: someone },
          })
        ).statusCode,
      ).toBe(401);
      // An invalid body is not even read: the caller learns nothing of its shape.
      expect(
        (
          await control("POST", "cal_a/move-to/cal_b", {
            ...options,
            payload: { calendarIds: "not-a-list" },
          })
        ).statusCode,
      ).toBe(401);
    }
  });

  it("answers 503 while the control plane is not configured", () => {
    const guard = new ControlPlaneGuard({ get: () => undefined } as never);
    expect(() => guard.canActivate({} as never)).toThrow(
      ServiceUnavailableException,
    );
  });

  it("rejects a move that does not name two workspaces and its calendars", async () => {
    const calendarIds = [randomUUID()];
    const cases: [string, object][] = [
      ["cal_a/move-to/cal_a", { calendarIds }],
      ["cal%20a/move-to/cal_b", { calendarIds }],
      ["cal_a/move-to/cal.b", { calendarIds }],
      ["cal_a/move-to/cal_b", {}],
      ["cal_a/move-to/cal_b", { calendarIds: [] }],
      ["cal_a/move-to/cal_b", { calendarIds: ["not-a-uuid"] }],
      [
        "cal_a/move-to/cal_b",
        { calendarIds: [calendarIds[0], calendarIds[0]] },
      ],
      [
        "cal_a/move-to/cal_b",
        { calendarIds: Array.from({ length: 501 }, () => randomUUID()) },
      ],
      ["cal_a/move-to/cal_b", { calendarIds, extra: true }],
    ];
    for (const [url, payload] of cases) {
      const response = await control("POST", url, {
        token: CONTROL_TOKEN,
        payload,
      });
      expect(response.statusCode, url).toBe(400);
    }
  });
});

describe.runIf(Boolean(databaseUrl))(
  "control plane — moving calendars (PostgreSQL)",
  () => {
    const event = (title: string) => ({
      title,
      start: "2026-11-02T09:00:00.000Z",
      end: "2026-11-02T10:00:00.000Z",
      allDay: false,
      timeZone: "UTC",
      status: "confirmed" as const,
      visibility: "default" as const,
      attendees: [],
    });
    const calendarInput = (name: string) => ({
      name,
      color: "#2563eb",
      timeZone: "UTC",
    });

    it("moves the named calendars with their events, changes nothing on a replay, and moves them back", async () => {
      const service = app.get(CalendarService);
      const project = `cal_${randomUUID().replaceAll("-", "")}`;
      const organization = `cal_${randomUUID().replaceAll("-", "")}`;
      try {
        const team = (await service.createCalendar(
          project,
          calendarInput("Team"),
        )) as { id: string };
        const ops = (await service.createCalendar(
          project,
          calendarInput("Ops"),
        )) as { id: string };
        const stays = (await service.createCalendar(
          project,
          calendarInput("Stays"),
        )) as { id: string };
        const existing = (await service.createCalendar(
          organization,
          calendarInput("Organization"),
        )) as { id: string };
        const teamEvents = [
          await service.createEvent(project, team.id, event("Kick-off")),
          await service.createEvent(project, team.id, event("Review")),
        ] as { id: string }[];
        const opsEvent = (await service.createEvent(
          project,
          ops.id,
          event("On call"),
        )) as { id: string };
        const stayingEvent = (await service.createEvent(
          project,
          stays.id,
          event("Not moved"),
        )) as { id: string };
        const before = await service.listCalendars(project);
        const named = [team.id, ops.id];

        const move = await control(
          "POST",
          `${project}/move-to/${organization}`,
          { token: CONTROL_TOKEN, payload: { calendarIds: named } },
        );
        expect(move.statusCode).toBe(200);
        expect(move.json()).toEqual({
          moved: named,
          alreadyInTarget: [],
          missing: [],
        });

        // The calendars are the organization's now, and their events came with them.
        const ids = (rows: unknown[]) =>
          new Set(rows.map((row) => (row as { id: string }).id));
        expect(ids(await service.listCalendars(organization))).toEqual(
          new Set([existing.id, team.id, ops.id]),
        );
        expect(ids(await service.listCalendars(project))).toEqual(
          new Set([stays.id]),
        );
        const range = ["2026-11-01T00:00:00.000Z", "2026-11-30T00:00:00.000Z"];
        expect(
          ids(await service.listEvents(organization, range[0]!, range[1]!)),
        ).toEqual(new Set([...teamEvents.map((e) => e.id), opsEvent.id]));
        expect(
          ids(await service.listEvents(project, range[0]!, range[1]!)),
        ).toEqual(new Set([stayingEvent.id]));
        const moved = await service.listCalendars(organization);

        // A replay finds them moved already, and changes nothing.
        const replay = await control(
          "POST",
          `${project}/move-to/${organization}`,
          { token: CONTROL_TOKEN, payload: { calendarIds: named } },
        );
        expect(replay.statusCode).toBe(200);
        expect(replay.json()).toEqual({
          moved: [],
          alreadyInTarget: named,
          missing: [],
        });
        expect(await service.listCalendars(organization)).toEqual(moved);

        // A calendar in neither workspace is reported, and moves nothing.
        const ghost = randomUUID();
        const partial = await control(
          "POST",
          `${project}/move-to/${organization}`,
          {
            token: CONTROL_TOKEN,
            payload: {
              calendarIds: [stays.id, ghost].map((id) => id.toUpperCase()),
            },
          },
        );
        expect(partial.json()).toEqual({
          moved: [stays.id],
          alreadyInTarget: [],
          missing: [ghost],
        });
        await control("POST", `${organization}/move-to/${project}`, {
          token: CONTROL_TOKEN,
          payload: { calendarIds: [stays.id] },
        });

        // Back: the project's calendars are exactly what they were, events included.
        const back = await control(
          "POST",
          `${organization}/move-to/${project}`,
          { token: CONTROL_TOKEN, payload: { calendarIds: named } },
        );
        expect(back.json()).toEqual({
          moved: named,
          alreadyInTarget: [],
          missing: [],
        });
        expect(await service.listCalendars(project)).toEqual(before);
        expect(ids(await service.listCalendars(organization))).toEqual(
          new Set([existing.id]),
        );
        expect(
          ids(await service.listEvents(project, range[0]!, range[1]!)),
        ).toEqual(
          new Set([
            ...teamEvents.map((e) => e.id),
            opsEvent.id,
            stayingEvent.id,
          ]),
        );
      } finally {
        await service.deleteWorkspace(project);
        await service.deleteWorkspace(organization);
      }
    });
  },
);
