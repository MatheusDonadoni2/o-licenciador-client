import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { LicensingError, LicensingUnavailableError } from "./errors.js";
import { parseRelease } from "./parse.js";
const invalid = (message) => new LicensingError("INVALID_ACCESS_TOKEN", 401, message);
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
        release: parseRelease(payload.release, 401),
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
    };
}
export class TokenVerifier {
    config;
    keys;
    constructor(config) {
        this.config = config;
        this.keys =
            config.jwks ??
                createRemoteJWKSet(new URL(`${config.baseUrl}/.well-known/jwks.json`), {
                    cooldownDuration: 30_000,
                    cacheMaxAge: 10 * 60_000,
                    timeoutDuration: 5_000,
                });
    }
    async verify(token) {
        try {
            const { payload } = await jwtVerify(token, this.keys, {
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
        if (error instanceof LicensingError)
            return error;
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
