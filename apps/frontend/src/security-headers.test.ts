import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./security-headers";

describe("Content-Security-Policy", () => {
  it("pins scripts to a request nonce without unsafe-inline", () => {
    const policy = contentSecurityPolicy(true, "nonce123");
    expect(policy).toContain("'nonce-nonce123'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
  });
});
