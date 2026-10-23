import { randomUUID } from "node:crypto";
import { LicensingError, LicensingUnavailableError } from "./errors.js";
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
export const newRequestId = () => randomUUID();
export class Transport {
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
            throw new LicensingUnavailableError(`O Licenciador respondeu ${response.status}`, {
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
            return new LicensingUnavailableError(`O Licenciador não respondeu em ${this.config.timeoutMs} ms`, { outcomeUnknown: true, cause: error });
        }
        const code = causeCode(error);
        const unreached = code !== undefined && UNREACHED_CODES.has(code);
        return new LicensingUnavailableError("Não foi possível falar com o Licenciador", {
            outcomeUnknown: !unreached,
            cause: error,
        });
    }
}
const asErrorBody = (body) => body !== null && typeof body === "object" ? body : {};
export function toLicensingError(status, body) {
    const parsed = asErrorBody(body);
    const message = Array.isArray(parsed.message)
        ? "Pedido inválido"
        : typeof parsed.message === "string"
            ? parsed.message
            : `O Licenciador respondeu ${status}`;
    if (typeof parsed.code === "string") {
        return new LicensingError(parsed.code, status, message, body);
    }
    if (status === 401)
        return new LicensingError("UNAUTHORIZED", status, message, body);
    if (status === 400)
        return new LicensingError("BAD_REQUEST", status, message, body);
    return new LicensingError("UNEXPECTED_RESPONSE", status, message, body);
}
export const impedimentsOf = (body) => {
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
export const isAccessDenied = (status, body) => status === 403 && asErrorBody(body).code === "ACCESS_DENIED";
