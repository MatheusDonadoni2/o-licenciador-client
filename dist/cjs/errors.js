"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicensingUnavailableError = exports.LicensingError = exports.LICENSING_ERROR_CODES = void 0;
exports.isLicensingError = isLicensingError;
exports.isUnavailable = isUnavailable;
exports.LICENSING_ERROR_CODES = [
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
class LicensingError extends Error {
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
exports.LicensingError = LicensingError;
class LicensingUnavailableError extends Error {
    outcomeUnknown;
    status;
    constructor(message, options) {
        super(message, { cause: options.cause });
        this.name = "LicensingUnavailableError";
        this.outcomeUnknown = options.outcomeUnknown;
        this.status = options.status ?? null;
    }
}
exports.LicensingUnavailableError = LicensingUnavailableError;
function isLicensingError(error, code) {
    return error instanceof LicensingError && (code === undefined || error.code === code);
}
function isUnavailable(error) {
    return error instanceof LicensingUnavailableError;
}
