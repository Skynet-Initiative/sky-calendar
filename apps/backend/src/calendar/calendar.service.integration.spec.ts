import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CalendarService } from "./calendar.service.js";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));

integration("CalendarService PostgreSQL isolation", () => {
  it("keeps reads and mutations inside one workspace and purges by cascade", async () => {
    const service = new CalendarService({
      getOrThrow: () => databaseUrl,
    } as never);
    const workspaceA = `cal_${randomUUID()}`;
    const workspaceB = `cal_${randomUUID()}`;
    try {
      const calendarA = (await service.createCalendar(workspaceA, {
        name: "A",
        color: "#2563eb",
        timeZone: "UTC",
      })) as { id: string };
      const calendarB = (await service.createCalendar(workspaceB, {
        name: "B",
        color: "#2563eb",
        timeZone: "UTC",
      })) as { id: string };
      const input = {
        title: "Private planning",
        start: "2026-09-14T09:00:00.000Z",
        end: "2026-09-14T10:00:00.000Z",
        allDay: false,
        timeZone: "UTC",
        status: "confirmed" as const,
        visibility: "default" as const,
        attendees: [],
      };
      const eventA = (await service.createEvent(
        workspaceA,
        calendarA.id,
        input,
      )) as { id: string };
      const eventA2 = (await service.createEvent(workspaceA, calendarA.id, {
        ...input,
        title: "Second planning",
      })) as { id: string };
      await service.createEvent(workspaceB, calendarB.id, input);

      await expect(
        service.listEvents(
          workspaceA,
          "2026-09-01T00:00:00.000Z",
          "2026-10-01T00:00:00.000Z",
        ),
      ).resolves.toHaveLength(2);
      const firstPage = await service.exportEvents(workspaceA, undefined, 1);
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.nextCursor).toBe(firstPage.items[0]?.id);
      const secondPage = await service.exportEvents(
        workspaceA,
        firstPage.nextCursor ?? undefined,
        1,
      );
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.nextCursor).toBeNull();
      expect(
        new Set(
          [...firstPage.items, ...secondPage.items].map((item) => item.id),
        ),
      ).toEqual(new Set([eventA.id, eventA2.id]));
      await expect(
        service.replaceEvent(workspaceB, eventA.id, input),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.deleteEvent(workspaceB, eventA.id),
      ).rejects.toMatchObject({ status: 404 });

      await service.deleteWorkspace(workspaceA);
      await expect(service.listCalendars(workspaceA)).resolves.toEqual([]);
      await expect(service.listCalendars(workspaceB)).resolves.toHaveLength(1);
    } finally {
      await service.deleteWorkspace(workspaceA);
      await service.deleteWorkspace(workspaceB);
      await service.onModuleDestroy();
    }
  });

  it("keeps a conference, moves events between calendars and cascades a calendar delete", async () => {
    const service = new CalendarService({
      getOrThrow: () => databaseUrl,
    } as never);
    const workspace = `cal_${randomUUID()}`;
    const foreign = `cal_${randomUUID()}`;
    try {
      const first = (await service.createCalendar(workspace, {
        name: "Team",
        color: "#2563eb",
        timeZone: "Europe/Paris",
      })) as { id: string };
      const second = (await service.createCalendar(workspace, {
        name: "Personal",
        color: "#16a34a",
        timeZone: "Europe/Paris",
      })) as { id: string };
      const elsewhere = (await service.createCalendar(foreign, {
        name: "Elsewhere",
        color: "#2563eb",
        timeZone: "UTC",
      })) as { id: string };
      const conference = {
        provider: "skydirect" as const,
        id: "fmYTdnEKrcwM",
        joinUrl: "https://app.example.test/direct/fmYTdnEKrcwM/",
      };
      const input = {
        title: "Weekly sync",
        start: "2026-10-26T09:00:00.000Z",
        end: "2026-10-26T09:30:00.000Z",
        allDay: false,
        timeZone: "Europe/Paris",
        status: "tentative" as const,
        visibility: "private" as const,
        attendees: [
          { email: "ana@example.com", displayName: "Ana", response: "accepted" as const },
        ],
        conference,
      };

      const created = (await service.createEvent(workspace, first.id, input)) as {
        id: string;
        calendarId: string;
        conference: unknown;
        attendees: unknown;
      };
      expect(created.conference).toEqual(conference);
      expect(created.attendees).toEqual(input.attendees);

      const moved = (await service.replaceEvent(workspace, created.id, {
        ...input,
        calendarId: second.id,
        conference: null,
      })) as { calendarId: string; conference: unknown };
      expect(moved.calendarId).toBe(second.id);
      expect(moved.conference).toBeNull();

      await expect(
        service.replaceEvent(workspace, created.id, { ...input, calendarId: elsewhere.id }),
      ).rejects.toMatchObject({ status: 404 });

      const renamed = (await service.updateCalendar(workspace, second.id, {
        name: "Mine",
        color: "#dc2626",
      })) as { name: string; color: string; timeZone: string };
      expect(renamed).toMatchObject({ name: "Mine", color: "#dc2626", timeZone: "Europe/Paris" });
      await expect(
        service.updateCalendar(foreign, second.id, { name: "Stolen" }),
      ).rejects.toMatchObject({ status: 404 });

      await expect(
        service.deleteCalendar(foreign, second.id),
      ).rejects.toMatchObject({ status: 404 });
      await service.deleteCalendar(workspace, second.id);
      await expect(
        service.listEvents(workspace, "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"),
      ).resolves.toEqual([]);
      await expect(service.listCalendars(workspace)).resolves.toHaveLength(1);
    } finally {
      await service.deleteWorkspace(workspace);
      await service.deleteWorkspace(foreign);
      await service.onModuleDestroy();
    }
  });
});
