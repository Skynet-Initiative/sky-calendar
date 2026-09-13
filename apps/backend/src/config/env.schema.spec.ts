import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.schema.js";

const valid = {
  DATABASE_URL: "postgresql://calendar:secret@localhost:5432/calendar",
  PLATFORM_MINTER_PUBLIC_KEYS: Buffer.alloc(32).toString("base64"),
  CORS_ORIGIN: "https://calendar.example.com",
};

describe("environment", () => {
  it("applies bounded defaults", () => {
    expect(validateEnv(valid)).toMatchObject({
      PORT: 4010,
      PLATFORM_TOKEN_AUDIENCE: "sky-calendar",
    });
  });

  it("rejects an empty public-key list", () => {
    expect(() =>
      validateEnv({ ...valid, PLATFORM_MINTER_PUBLIC_KEYS: "" }),
    ).toThrow();
  });
});
