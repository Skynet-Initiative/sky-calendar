import { generateKeyPairSync } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  authorize,
  PlatformTokenVerifier,
  principalFromPayload,
  type Principal,
} from "./auth.js";

const now = 2_000_000_000;
const actor = "act_0123456789abcdef0123456789abcdef";

function principal(grants: string[]): Principal {
  return { actor, grants: new Set(grants) };
}

describe("calendar authorization", () => {
  it("verifies a real Ed25519 token and supports key rotation", async () => {
    const oldKeys = generateKeyPairSync("ed25519");
    const currentKeys = generateKeyPairSync("ed25519");
    const publicKey = (key: typeof currentKeys.publicKey) => {
      const jwk = key.export({ format: "jwk" });
      if (typeof jwk.x !== "string") throw new Error("Missing Ed25519 key");
      return Buffer.from(jwk.x, "base64url").toString("base64");
    };
    const issuedAt = Math.floor(Date.now() / 1_000);
    const token = await new SignJWT({
      actor,
      scope: "read:workspace:workspace-a",
    })
      .setProtectedHeader({ alg: "EdDSA" })
      .setAudience("sky-calendar")
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 300)
      .sign(currentKeys.privateKey);
    const verifier = new PlatformTokenVerifier(
      [publicKey(oldKeys.publicKey), publicKey(currentKeys.publicKey)],
      "sky-calendar",
    );
    await expect(verifier.verify(token)).resolves.toMatchObject({ actor });
    const segments = token.split(".");
    const signature = segments[2];
    if (!signature) throw new Error("Missing JWT signature");
    const index = Math.floor(signature.length / 2);
    const replacement = signature[index] === "A" ? "B" : "A";
    segments[2] = `${signature.slice(0, index)}${replacement}${signature.slice(index + 1)}`;
    await expect(verifier.verify(segments.join("."))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("returns forbidden for a valid token minted for another package", async () => {
    const keys = generateKeyPairSync("ed25519");
    const jwk = keys.publicKey.export({ format: "jwk" });
    if (typeof jwk.x !== "string") throw new Error("Missing Ed25519 key");
    const issuedAt = Math.floor(Date.now() / 1_000);
    const token = await new SignJWT({
      actor,
      scope: "read:workspace:workspace-a",
    })
      .setProtectedHeader({ alg: "EdDSA" })
      .setAudience("another-package")
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 300)
      .sign(keys.privateKey);
    const verifier = new PlatformTokenVerifier(
      [Buffer.from(jwk.x, "base64url").toString("base64")],
      "sky-calendar",
    );

    await expect(verifier.verify(token)).rejects.toThrow("Forbidden");
  });

  it("requires both the action and exact workspace grant", () => {
    const subject = principal(["read:workspace:workspace-a"]);
    expect(authorize(subject, "workspace-a", "read")).toBe(true);
    expect(authorize(subject, "workspace-b", "read")).toBe(false);
    expect(authorize(subject, "workspace-a", "manage")).toBe(false);
  });

  it("accepts only the adopted platform claim profile", () => {
    expect(
      principalFromPayload(
        {
          actor,
          aud: "sky-calendar",
          iat: now,
          exp: now + 300,
          scope: "manage:workspace:workspace-a read:workspace:workspace-a",
        },
        "sky-calendar",
        now,
      ),
    ).toMatchObject({ actor });
  });

  it.each([
    ["wrong audience", { aud: "other" }],
    ["invalid actor", { actor: "user-1" }],
    ["long lifetime", { exp: now + 601 }],
    ["malformed scope", { scope: "read:project:workspace-a" }],
    ["unknown action", { scope: "delete:workspace:workspace-a" }],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      principalFromPayload(
        {
          actor,
          aud: "sky-calendar",
          iat: now,
          exp: now + 300,
          scope: "read:workspace:workspace-a",
          ...override,
        },
        "sky-calendar",
        now,
      ),
    ).toThrow(UnauthorizedException);
  });
});
