import { createPublicKey, type KeyObject } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { jwtVerify } from "jose";

const PUBLIC_ROUTE = "sky-calendar:public";
const ACTOR_PATTERN = /^act_[0-9a-f]{32}$/;
const RESOURCE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_GRANTS = 1_000;
const CLOCK_TOLERANCE_SECONDS = 30;
const MAX_TOKEN_LIFETIME_SECONDS = 600;

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export type CalendarAction = "read" | "manage";

export interface Principal {
  actor: string;
  grants: ReadonlySet<string>;
}

export type AuthenticatedRequest = FastifyRequest & { principal: Principal };

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  private readonly verifier: PlatformTokenVerifier;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.verifier = new PlatformTokenVerifier(
      config.getOrThrow<string>("PLATFORM_MINTER_PUBLIC_KEYS").split(","),
      config.getOrThrow<string>("PLATFORM_TOKEN_AUDIENCE"),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw unauthorized();

    (request as AuthenticatedRequest).principal = await this.verifier.verify(
      authorization.slice(7),
    );
    return true;
  }
}

export class PlatformTokenVerifier {
  private readonly keys: readonly KeyObject[];

  constructor(
    publicKeysBase64: readonly string[],
    private readonly audience: string,
  ) {
    if (publicKeysBase64.length === 0)
      throw new Error("A public key is required");
    this.keys = publicKeysBase64.map(parsePublicKey);
  }

  async verify(token: string): Promise<Principal> {
    for (const key of this.keys) {
      try {
        const { payload } = await jwtVerify(token, key, {
          audience: this.audience,
          algorithms: ["EdDSA"],
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          requiredClaims: ["aud", "exp", "iat", "scope", "actor"],
        });
        return principalFromPayload(payload, this.audience);
      } catch {
        // The next locally configured key may be active during rotation.
      }
    }
    throw unauthorized();
  }
}

export function principalFromPayload(
  payload: Record<string, unknown>,
  audience: string,
  now = Math.floor(Date.now() / 1_000),
): Principal {
  const { actor, aud, exp, iat } = payload;
  if (
    aud !== audience ||
    typeof actor !== "string" ||
    !ACTOR_PATTERN.test(actor) ||
    typeof exp !== "number" ||
    !Number.isInteger(exp) ||
    typeof iat !== "number" ||
    !Number.isInteger(iat) ||
    iat > now + CLOCK_TOLERANCE_SECONDS ||
    exp <= iat ||
    exp - iat > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw unauthorized();
  }
  return { actor, grants: parseScope(payload.scope) };
}

export function authorize(
  principal: Principal,
  workspaceId: string,
  action: CalendarAction,
) {
  return principal.grants.has(`${action}:workspace:${workspaceId}`);
}

function parseScope(scope: unknown): ReadonlySet<string> {
  if (
    typeof scope !== "string" ||
    scope.length === 0 ||
    scope !== scope.trim() ||
    /\s\s|[^\S ]/.test(scope)
  ) {
    throw unauthorized();
  }
  const entries = scope.split(" ");
  if (entries.length > MAX_GRANTS) throw unauthorized();
  for (const entry of entries) {
    const [action, resourceType, resourceId, extra] = entry.split(":");
    if (
      extra !== undefined ||
      (action !== "read" && action !== "manage") ||
      resourceType !== "workspace" ||
      !resourceId ||
      !RESOURCE_PATTERN.test(resourceId)
    ) {
      throw unauthorized();
    }
  }
  return new Set(entries);
}

function parsePublicKey(value: string): KeyObject {
  const raw = Buffer.from(value.trim(), "base64");
  if (raw.length !== 32) {
    throw new Error(
      "Platform minter public keys must be raw 32-byte Ed25519 keys",
    );
  }
  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    raw,
  ]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

function unauthorized() {
  return new UnauthorizedException("Unauthorized");
}
