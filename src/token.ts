import { createRemoteJWKSet, errors, type JWTVerifyGetKey, jwtVerify } from "jose";

import { LicensingError, LicensingUnavailableError } from "./errors.js";
import { parseRelease } from "./parse.js";
import type { AccessTokenClaims, EntitlementStatus } from "./types.js";

export type TokenVerifierConfig = {
  baseUrl: string;
  clientId: string;
  jwks?: JWTVerifyGetKey;
  clockToleranceSeconds?: number;
};

type Payload = Record<string, unknown>;

const invalid = (message: string): LicensingError =>
  new LicensingError("INVALID_ACCESS_TOKEN", 401, message);

const nullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

function requiredString(payload: Payload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value === "") throw invalid(`O token não traz ${key}`);
  return value;
}

function toClaims(payload: Payload): AccessTokenClaims {
  if (payload.role !== "customer") throw invalid("O token não é de cliente");
  const entitlement = payload.entitlement as Payload | undefined;
  if (!entitlement || typeof entitlement !== "object")
    throw invalid("O token não traz entitlement");
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    throw invalid("O token não traz iat e exp");
  }
  return {
    customerId: requiredString(payload, "sub"),
    email: requiredString(payload, "email"),
    name: requiredString(payload, "name"),
    appId: requiredString(payload, "appId"),
    appSlug: requiredString(payload, "appSlug"),
    deviceId: nullableString(payload.deviceId),
    sessionId: requiredString(payload, "sessionId"),
    entitlement: {
      status: requiredString(entitlement, "status") as EntitlementStatus,
      licenseId: nullableString(entitlement.licenseId),
      planName: nullableString(entitlement.planName),
      expiresAt: nullableString(entitlement.expiresAt),
    },
    release: parseRelease(payload.release, 401),
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: new Date(payload.exp * 1000),
  };
}

export class TokenVerifier {
  private readonly keys: JWTVerifyGetKey;

  constructor(private readonly config: TokenVerifierConfig) {
    this.keys =
      config.jwks ??
      createRemoteJWKSet(new URL(`${config.baseUrl}/.well-known/jwks.json`), {
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
        timeoutDuration: 5_000,
      });
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        audience: this.config.clientId,
        algorithms: ["EdDSA"],
        clockTolerance: this.config.clockToleranceSeconds ?? 5,
      });
      return toClaims(payload as Payload);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): Error {
    if (error instanceof LicensingError) return error;
    if (error instanceof errors.JWTExpired) {
      return new LicensingError("ACCESS_TOKEN_EXPIRED", 401, "O access token venceu");
    }
    if (error instanceof errors.JWKSTimeout) {
      return new LicensingUnavailableError("Não foi possível buscar as chaves do Licenciador", {
        outcomeUnknown: false,
        cause: error,
      });
    }
    if (error instanceof errors.JOSEError) {
      return invalid("O access token é inválido");
    }
    return new LicensingUnavailableError("Não foi possível buscar as chaves do Licenciador", {
      outcomeUnknown: false,
      cause: error,
    });
  }
}
