export declare const LICENSING_ERROR_CODES: readonly ["INVALID_CREDENTIALS", "INVALID_REFRESH_TOKEN", "PASSWORD_CHANGE_REQUIRED", "CUSTOMER_DISABLED", "APP_INACTIVE", "NEW_LOGINS_BLOCKED", "NEW_USERS_BLOCKED", "REGISTRATION_CLOSED", "REQUEST_ALREADY_PROCESSED", "EMAIL_ALREADY_REGISTERED", "TOO_MANY_ATTEMPTS", "UNAUTHORIZED", "BAD_REQUEST", "INVALID_ACCESS_TOKEN", "ACCESS_TOKEN_EXPIRED", "UNEXPECTED_RESPONSE"];
export type LicensingErrorCode = (typeof LICENSING_ERROR_CODES)[number];
export declare class LicensingError extends Error {
    readonly code: LicensingErrorCode | (string & {});
    readonly status: number;
    readonly details: unknown;
    constructor(code: string, status: number, message: string, details?: unknown);
}
export declare class LicensingUnavailableError extends Error {
    readonly outcomeUnknown: boolean;
    readonly status: number | null;
    constructor(message: string, options: {
        outcomeUnknown: boolean;
        status?: number;
        cause?: unknown;
    });
}
export declare function isLicensingError(error: unknown, code?: LicensingErrorCode): error is LicensingError;
export declare function isUnavailable(error: unknown): error is LicensingUnavailableError;
