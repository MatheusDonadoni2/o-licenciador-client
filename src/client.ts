import type { JWTVerifyGetKey } from "jose";

import { LicensingError } from "./errors.js";
import { parseCustomer, parseGrant } from "./parse.js";
import { TokenVerifier } from "./token.js";
import {
  type FetchLike,
  impedimentsOf,
  isAccessDenied,
  newRequestId,
  toLicensingError,
  Transport,
} from "./transport.js";
import type {
  AccessTokenClaims,
  CredentialResult,
  Customer,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from "./types.js";

export type LicensingClientConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  fetch?: FetchLike;
  requestId?: () => string;
  jwks?: JWTVerifyGetKey;
  clockToleranceSeconds?: number;
};

export type LicensingClient = {
  register(input: RegisterInput): Promise<Customer>;
  login(input: LoginInput): Promise<CredentialResult>;
  refresh(input: RefreshInput): Promise<CredentialResult>;
  logout(input: LogoutInput): Promise<void>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError(`baseUrl inválida: ${baseUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("baseUrl precisa ser http ou https");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function requireText(value: string, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} é obrigatório`);
  }
  return value.trim();
}

export function createLicensingClient(config: LicensingClientConfig): LicensingClient {
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

  async function credentialResult(
    path: string,
    body: unknown,
    clientIp: string | undefined,
  ): Promise<CredentialResult> {
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
      const response = await transport.post(
        "/v1/credentials/register",
        { email: input.email, password: input.password, name: input.name },
        input.clientIp,
      );
      if (response.status === 201) return parseCustomer(response.body, response.status);
      throw toLicensingError(response.status, response.body);
    },

    login(input) {
      return credentialResult(
        "/v1/credentials/login",
        {
          email: input.email,
          password: input.password,
          deviceId: input.deviceId,
          ...(input.deviceName ? { deviceName: input.deviceName } : {}),
        },
        input.clientIp,
      );
    },

    refresh(input) {
      return credentialResult(
        "/v1/credentials/refresh",
        { refreshToken: input.refreshToken },
        input.clientIp,
      );
    },

    async logout(input) {
      const response = await transport.post(
        "/v1/credentials/logout",
        { refreshToken: input.refreshToken },
        input.clientIp,
      );
      if (response.status === 204 || response.status === 200) return;
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
