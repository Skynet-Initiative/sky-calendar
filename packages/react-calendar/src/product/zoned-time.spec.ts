import { describe, expect, it } from "vitest";
import {
  instantFromLocalInput,
  localInputFromInstant,
  wallDateFromInstant,
} from "./zoned-time";

describe("product zoned time", () => {
  it("round-trips wall time independently from the browser zone", () => {
    const instant = instantFromLocalInput(
      "2026-09-14T09:30",
      "America/New_York",
    );
    expect(instant.toISOString()).toBe("2026-09-14T13:30:00.000Z");
    expect(localInputFromInstant(instant, "America/New_York")).toBe(
      "2026-09-14T09:30",
    );
    expect(wallDateFromInstant(instant, "Europe/Paris").toISOString()).toBe(
      "2026-09-14T15:30:00.000Z",
    );
  });

  it("uses the DST offset active on each date", () => {
    expect(
      instantFromLocalInput(
        "2026-01-15T09:00",
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-01-15T14:00:00.000Z");
    expect(
      instantFromLocalInput(
        "2026-07-15T09:00",
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-07-15T13:00:00.000Z");
  });

  it("rejects a local time skipped by the DST transition", () => {
    expect(() =>
      instantFromLocalInput("2026-03-08T02:30", "America/New_York"),
    ).toThrow(/does not exist/);
  });
});
