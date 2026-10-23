"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCustomer = parseCustomer;
exports.parseRelease = parseRelease;
exports.parseGrant = parseGrant;
const errors_js_1 = require("./errors.js");
const unexpected = (what, status) => new errors_js_1.LicensingError("UNEXPECTED_RESPONSE", status, `Resposta inesperada do Licenciador: ${what}`);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (raw, key, status) => {
    const value = raw[key];
    if (typeof value !== "string" || value === "")
        throw unexpected(`falta ${key}`, status);
    return value;
};
const nullableText = (raw, key) => {
    const value = raw[key];
    return typeof value === "string" ? value : null;
};
function parseCustomer(value, status) {
    if (!isRecord(value))
        throw unexpected("cliente ausente", status);
    return {
        id: text(value, "id", status),
        email: text(value, "email", status),
        name: text(value, "name", status),
    };
}
function parseEntitlement(value, status) {
    if (!isRecord(value))
        throw unexpected("entitlement ausente", status);
    return {
        status: text(value, "status", status),
        licenseId: nullableText(value, "licenseId"),
        planName: nullableText(value, "planName"),
        startsAt: nullableText(value, "startsAt"),
        expiresAt: nullableText(value, "expiresAt"),
        accessGranted: value.accessGranted === true,
    };
}
function parseRelease(value, status) {
    if (value === null || value === undefined)
        return null;
    if (!isRecord(value))
        throw unexpected("release inválida", status);
    return {
        action: text(value, "action", status),
        expiresAt: nullableText(value, "expiresAt"),
    };
}
function parseGrant(value, status) {
    if (!isRecord(value))
        throw unexpected("corpo ausente", status);
    const seconds = value.accessTokenExpiresInSeconds;
    if (typeof seconds !== "number")
        throw unexpected("falta accessTokenExpiresInSeconds", status);
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
