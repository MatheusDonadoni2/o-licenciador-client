import { LicensingError } from "./errors.js";
import { parseCustomer, parseGrant } from "./parse.js";
import { TokenVerifier } from "./token.js";
import { impedimentsOf, isAccessDenied, newRequestId, toLicensingError, Transport, } from "./transport.js";
const DEFAULT_TIMEOUT_MS = 10_000;
function normalizeBaseUrl(baseUrl) {
    let url;
    try {
        url = new URL(baseUrl);
    }
    catch {
        throw new TypeError(`baseUrl inválida: ${baseUrl}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new TypeError("baseUrl precisa ser http ou https");
    }
    return url.origin + url.pathname.replace(/\/+$/, "");
}
function requireText(value, name) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError(`${name} é obrigatório`);
    }
    return value.trim();
}
export function createLicensingClient(config) {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const clientId = requireText(config.clientId, "clientId");
    const clientSecret = requireText(config.clientSecret, "clientSecret");
    const transport = new Transport({
        baseUrl,
        clientId,
        clientSecret,
        timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetch: config.fetch ?? ((input, init) => fetch(input, init)),
        requestId: config.requestId ?? newRequestId,
    });
    const verifier = new TokenVerifier({
        baseUrl,
        clientId,
        jwks: config.jwks,
        clockToleranceSeconds: config.clockToleranceSeconds,
    });
    async function credentialResult(path, body, clientIp) {
        const response = await transport.post(path, body, clientIp);
        if (response.status === 200) {
            return { status: "GRANTED", grant: parseGrant(response.body, response.status) };
        }
        if (isAccessDenied(response.status, response.body)) {
            return { status: "DENIED", impediments: impedimentsOf(response.body) };
        }
        throw toLicensingError(response.status, response.body);
    }
    return {
        async register(input) {
            const response = await transport.post("/v1/credentials/register", { email: input.email, password: input.password, name: input.name }, input.clientIp);
            if (response.status === 201)
                return parseCustomer(response.body, response.status);
            throw toLicensingError(response.status, response.body);
        },
        login(input) {
            return credentialResult("/v1/credentials/login", {
                email: input.email,
                password: input.password,
                deviceId: input.deviceId,
                ...(input.deviceName ? { deviceName: input.deviceName } : {}),
            }, input.clientIp);
        },
        refresh(input) {
            return credentialResult("/v1/credentials/refresh", { refreshToken: input.refreshToken }, input.clientIp);
        },
        async logout(input) {
            const response = await transport.post("/v1/credentials/logout", { refreshToken: input.refreshToken }, input.clientIp);
            if (response.status === 204 || response.status === 200)
                return;
            throw toLicensingError(response.status, response.body);
        },
        verifyAccessToken(token) {
            if (typeof token !== "string" || token === "") {
                return Promise.reject(new LicensingError("INVALID_ACCESS_TOKEN", 401, "Token vazio"));
            }
            return verifier.verify(token);
        },
    };
}
