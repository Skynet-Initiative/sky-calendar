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
      await service.createEvent(workspaceB, calendarB.id, input);

      await expect(
        service.listEvents(
          workspaceA,
          "2026-09-01T00:00:00.000Z",
          "2026-10-01T00:00:00.000Z",
        ),
      ).resolves.toHaveLength(1);
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
});
