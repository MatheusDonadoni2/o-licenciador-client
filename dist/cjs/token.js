"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenVerifier = void 0;
const jose_1 = require("jose");
const errors_js_1 = require("./errors.js");
const parse_js_1 = require("./parse.js");
const invalid = (message) => new errors_js_1.LicensingError("INVALID_ACCESS_TOKEN", 401, message);
const nullableString = (value) => typeof value === "string" ? value : null;
function requiredString(payload, key) {
    const value = payload[key];
    if (typeof value !== "string" || value === "")
        throw invalid(`O token não traz ${key}`);
    return value;
}
function toClaims(payload) {
    if (payload.role !== "customer")
        throw invalid("O token não é de cliente");
    const entitlement = payload.entitlement;
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
            status: requiredString(entitlement, "status"),
            licenseId: nullableString(entitlement.licenseId),
            planName: nullableString(entitlement.planName),
            expiresAt: nullableString(entitlement.expiresAt),
        },
        release: (0, parse_js_1.parseRelease)(payload.release, 401),
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
    };
}
class TokenVerifier {
    config;
    keys;
    constructor(config) {
        this.config = config;
        this.keys =
            config.jwks ??
                (0, jose_1.createRemoteJWKSet)(new URL(`${config.baseUrl}/.well-known/jwks.json`), {
                    cooldownDuration: 30_000,
                    cacheMaxAge: 10 * 60_000,
                    timeoutDuration: 5_000,
                });
    }
    async verify(token) {
        try {
            const { payload } = await (0, jose_1.jwtVerify)(token, this.keys, {
                audience: this.config.clientId,
                algorithms: ["EdDSA"],
                clockTolerance: this.config.clockToleranceSeconds ?? 5,
            });
            return toClaims(payload);
        }
        catch (error) {
            throw this.translate(error);
        }
    }
    translate(error) {
        if (error instanceof errors_js_1.LicensingError)
            return error;
        if (error instanceof jose_1.errors.JWTExpired) {
            return new errors_js_1.LicensingError("ACCESS_TOKEN_EXPIRED", 401, "O access token venceu");
        }
        if (error instanceof jose_1.errors.JWKSTimeout) {
            return new errors_js_1.LicensingUnavailableError("Não foi possível buscar as chaves do Licenciador", {
                outcomeUnknown: false,
                cause: error,
            });
        }
        if (error instanceof jose_1.errors.JOSEError) {
            return invalid("O access token é inválido");
        }
        return new errors_js_1.LicensingUnavailableError("Não foi possível buscar as chaves do Licenciador", {
            outcomeUnknown: false,
            cause: error,
        });
    }
}
exports.TokenVerifier = TokenVerifier;
