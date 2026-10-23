"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLicensingClient = createLicensingClient;
const errors_js_1 = require("./errors.js");
const parse_js_1 = require("./parse.js");
const token_js_1 = require("./token.js");
const transport_js_1 = require("./transport.js");
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
function createLicensingClient(config) {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const clientId = requireText(config.clientId, "clientId");
    const clientSecret = requireText(config.clientSecret, "clientSecret");
    const transport = new transport_js_1.Transport({
        baseUrl,
        clientId,
        clientSecret,
        timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetch: config.fetch ?? ((input, init) => fetch(input, init)),
        requestId: config.requestId ?? transport_js_1.newRequestId,
    });
    const verifier = new token_js_1.TokenVerifier({
        baseUrl,
        clientId,
        jwks: config.jwks,
        clockToleranceSeconds: config.clockToleranceSeconds,
    });
    async function credentialResult(path, body, clientIp) {
        const response = await transport.post(path, body, clientIp);
        if (response.status === 200) {
            return { status: "GRANTED", grant: (0, parse_js_1.parseGrant)(response.body, response.status) };
        }
        if ((0, transport_js_1.isAccessDenied)(response.status, response.body)) {
            return { status: "DENIED", impediments: (0, transport_js_1.impedimentsOf)(response.body) };
        }
        throw (0, transport_js_1.toLicensingError)(response.status, response.body);
    }
    return {
        async register(input) {
            const response = await transport.post("/v1/credentials/register", { email: input.email, password: input.password, name: input.name }, input.clientIp);
            if (response.status === 201)
                return (0, parse_js_1.parseCustomer)(response.body, response.status);
            throw (0, transport_js_1.toLicensingError)(response.status, response.body);
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
            throw (0, transport_js_1.toLicensingError)(response.status, response.body);
        },
        verifyAccessToken(token) {
            if (typeof token !== "string" || token === "") {
                return Promise.reject(new errors_js_1.LicensingError("INVALID_ACCESS_TOKEN", 401, "Token vazio"));
            }
            return verifier.verify(token);
        },
    };
}
