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
];
export class LicensingError extends Error {
    code;
    status;
    details;
    constructor(code, status, message, details) {
        super(message);
        this.name = "LicensingError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}
export class LicensingUnavailableError extends Error {
    outcomeUnknown;
    status;
    constructor(message, options) {
        super(message, { cause: options.cause });
        this.name = "LicensingUnavailableError";
        this.outcomeUnknown = options.outcomeUnknown;
        this.status = options.status ?? null;
    }
}
export function isLicensingError(error, code) {
    return error instanceof LicensingError && (code === undefined || error.code === code);
}
export function isUnavailable(error) {
    return error instanceof LicensingUnavailableError;
}
