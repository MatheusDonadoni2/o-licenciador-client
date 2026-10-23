export const LICENSING_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "INVALID_REFRESH_TOKEN",
  "PASSWORD_CHANGE_REQUIRED",
  "CUSTOMER_DISABLED",
  "APP_INACTIVE",
  "NEW_LOGINS_BLOCKED",
  "NEW_USERS_BLOCKED",
  "REGISTRATION_CLOSED",
  "REQUEST_ALREADY_PROCESSED",
  "EMAIL_ALREADY_REGISTERED",
  "TOO_MANY_ATTEMPTS",
  "UNAUTHORIZED",
  "BAD_REQUEST",
  "INVALID_ACCESS_TOKEN",
  "ACCESS_TOKEN_EXPIRED",
  "UNEXPECTED_RESPONSE",
] as const;

export type LicensingErrorCode = (typeof LICENSING_ERROR_CODES)[number];

export class LicensingError extends Error {
  readonly code: LicensingErrorCode | (string & {});
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = "LicensingError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class LicensingUnavailableError extends Error {
  readonly outcomeUnknown: boolean;
  readonly status: number | null;

  constructor(
    message: string,
    options: { outcomeUnknown: boolean; status?: number; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "LicensingUnavailableError";
    this.outcomeUnknown = options.outcomeUnknown;
    this.status = options.status ?? null;
  }
}

export function isLicensingError(
  error: unknown,
  code?: LicensingErrorCode,
): error is LicensingError {
  return error instanceof LicensingError && (code === undefined || error.code === code);
}

export function isUnavailable(error: unknown): error is LicensingUnavailableError {
  return error instanceof LicensingUnavailableError;
}
