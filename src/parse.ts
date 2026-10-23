import { LicensingError } from "./errors.js";
import type {
  Customer,
  Entitlement,
  EntitlementStatus,
  Grant,
  Release,
  ReleaseAction,
} from "./types.js";

type Raw = Record<string, unknown>;

const unexpected = (what: string, status: number): LicensingError =>
  new LicensingError("UNEXPECTED_RESPONSE", status, `Resposta inesperada do Licenciador: ${what}`);

const isRecord = (value: unknown): value is Raw =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (raw: Raw, key: string, status: number): string => {
  const value = raw[key];
  if (typeof value !== "string" || value === "") throw unexpected(`falta ${key}`, status);
  return value;
};

const nullableText = (raw: Raw, key: string): string | null => {
  const value = raw[key];
  return typeof value === "string" ? value : null;
};

export function parseCustomer(value: unknown, status: number): Customer {
  if (!isRecord(value)) throw unexpected("cliente ausente", status);
  return {
    id: text(value, "id", status),
    email: text(value, "email", status),
    name: text(value, "name", status),
  };
}

function parseEntitlement(value: unknown, status: number): Entitlement {
  if (!isRecord(value)) throw unexpected("entitlement ausente", status);
  return {
    status: text(value, "status", status) as EntitlementStatus,
    licenseId: nullableText(value, "licenseId"),
    planName: nullableText(value, "planName"),
    startsAt: nullableText(value, "startsAt"),
    expiresAt: nullableText(value, "expiresAt"),
    accessGranted: value.accessGranted === true,
  };
}

export function parseRelease(value: unknown, status: number): Release | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw unexpected("release inválida", status);
  return {
    action: text(value, "action", status) as ReleaseAction,
    expiresAt: nullableText(value, "expiresAt"),
  };
}

export function parseGrant(value: unknown, status: number): Grant {
  if (!isRecord(value)) throw unexpected("corpo ausente", status);
  const seconds = value.accessTokenExpiresInSeconds;
  if (typeof seconds !== "number") throw unexpected("falta accessTokenExpiresInSeconds", status);
  return {
    sessionId: text(value, "sessionId", status),
    accessToken: text(value, "accessToken", status),
    refreshToken: text(value, "refreshToken", status),
    accessTokenExpiresInSeconds: seconds,
    customer: parseCustomer(value.customer, status),
    entitlement: parseEntitlement(value.entitlement, status),
    release: parseRelease(value.release, status),
  };
}
