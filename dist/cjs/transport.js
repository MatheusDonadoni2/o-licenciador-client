"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAccessDenied = exports.impedimentsOf = exports.Transport = exports.newRequestId = void 0;
exports.toLicensingError = toLicensingError;
const node_crypto_1 = require("node:crypto");
const errors_js_1 = require("./errors.js");
const UNREACHED_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ERR_INVALID_URL"]);
const isAbort = (error) => error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
function causeCode(error) {
    if (!(error instanceof Error))
        return undefined;
    const cause = error.cause;
    if (cause && typeof cause === "object" && "code" in cause) {
        return String(cause.code);
    }
    return undefined;
}
const newRequestId = () => (0, node_crypto_1.randomUUID)();
exports.newRequestId = newRequestId;
class Transport {
    config;
    constructor(config) {
        this.config = config;
    }
    async post(path, body, clientIp) {
        const headers = {
            "content-type": "application/json",
            accept: "application/json",
            "x-app-id": this.config.clientId,
            "x-app-secret": this.config.clientSecret,
            "x-request-id": this.config.requestId(),
        };
        if (clientIp)
            headers["x-end-user-ip"] = clientIp;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
        let response;
        try {
            response = await this.config.fetch(`${this.config.baseUrl}${path}`, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        }
        catch (error) {
            throw this.unavailable(error);
        }
        finally {
            clearTimeout(timer);
        }
        const parsed = await this.readBody(response);
        if (response.status >= 500) {
            throw new errors_js_1.LicensingUnavailableError(`O Licenciador respondeu ${response.status}`, {
                outcomeUnknown: true,
                status: response.status,
            });
        }
        return { status: response.status, body: parsed };
    }
    async readBody(response) {
        let text;
        try {
            text = await response.text();
        }
        catch (error) {
            throw this.unavailable(error);
        }
        if (text === "")
            return null;
        try {
            return JSON.parse(text);
        }
        catch {
            return text;
        }
    }
    unavailable(error) {
        if (isAbort(error)) {
            return new errors_js_1.LicensingUnavailableError(`O Licenciador não respondeu em ${this.config.timeoutMs} ms`, { outcomeUnknown: true, cause: error });
        }
        const code = causeCode(error);
        const unreached = code !== undefined && UNREACHED_CODES.has(code);
        return new errors_js_1.LicensingUnavailableError("Não foi possível falar com o Licenciador", {
            outcomeUnknown: !unreached,
            cause: error,
        });
    }
}
exports.Transport = Transport;
const asErrorBody = (body) => body !== null && typeof body === "object" ? body : {};
function toLicensingError(status, body) {
    const parsed = asErrorBody(body);
    const message = Array.isArray(parsed.message)
        ? "Pedido inválido"
        : typeof parsed.message === "string"
            ? parsed.message
            : `O Licenciador respondeu ${status}`;
    if (typeof parsed.code === "string") {
        return new errors_js_1.LicensingError(parsed.code, status, message, body);
    }
    if (status === 401)
        return new errors_js_1.LicensingError("UNAUTHORIZED", status, message, body);
    if (status === 400)
        return new errors_js_1.LicensingError("BAD_REQUEST", status, message, body);
    return new errors_js_1.LicensingError("UNEXPECTED_RESPONSE", status, message, body);
}
const impedimentsOf = (body) => {
    const raw = asErrorBody(body).impediments;
    if (!Array.isArray(raw))
        return [];
    return raw.map((item) => {
        const entry = (item ?? {});
        return {
            code: typeof entry.code === "string" ? entry.code : null,
            message: typeof entry.message === "string" ? entry.message : "Acesso indisponível no momento.",
        };
    });
};
exports.impedimentsOf = impedimentsOf;
const isAccessDenied = (status, body) => status === 403 && asErrorBody(body).code === "ACCESS_DENIED";
exports.isAccessDenied = isAccessDenied;
