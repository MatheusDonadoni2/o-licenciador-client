import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

export type RecordedRequest = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
};

export type Reply = {
  status: number;
  body?: unknown;
  delayMs?: number;
};

export type TokenOptions = {
  audience?: string;
  subject?: string;
  expiresIn?: string | number;
  issuedAt?: number;
  claims?: Record<string, unknown>;
  keyOverride?: PrivateKey;
};

export type FakeServer = {
  url: string;
  requests: RecordedRequest[];
  reply(path: string, ...replies: Reply[]): void;
  signToken(options?: TokenOptions): Promise<string>;
  otherKey(): Promise<PrivateKey>;
  close(): Promise<void>;
};

export const DEFAULT_CLAIMS = {
  role: "customer",
  appId: "app-uuid",
  appSlug: "prumo",
  email: "pessoa@exemplo.test",
  name: "Pessoa",
  deviceId: "device-0001",
  sessionId: "session-0001",
  entitlement: {
    status: "ACTIVE",
    licenseId: "license-1",
    planName: "Mensal",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
  release: null,
};

export async function startFakeServer(): Promise<FakeServer> {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "EdDSA", use: "sig" };
  const queues = new Map<string, Reply[]>();
  const requests: RecordedRequest[] = [];

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const path = request.url ?? "/";
      const raw = Buffer.concat(chunks).toString("utf8");

      if (request.method === "GET" && path === "/.well-known/jwks.json") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ keys: [jwk] }));
        return;
      }

      requests.push({
        method: request.method ?? "",
        path,
        headers: request.headers,
        body: raw ? JSON.parse(raw) : null,
      });

      const queue = queues.get(path) ?? [];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      const reply = next ?? { status: 500, body: { code: "NO_REPLY", message: "sem resposta" } };

      setTimeout(() => {
        if (reply.body === undefined) {
          response.writeHead(reply.status);
          response.end();
          return;
        }
        response.writeHead(reply.status, { "content-type": "application/json" });
        response.end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body));
      }, reply.delayMs ?? 0);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    requests,
    reply(path, ...replies) {
      queues.set(path, replies);
    },
    async signToken(options = {}) {
      const builder = new SignJWT({ ...DEFAULT_CLAIMS, ...options.claims })
        .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
        .setSubject(options.subject ?? "customer-uuid")
        .setAudience(options.audience ?? "app_test")
        .setIssuedAt(options.issuedAt)
        .setExpirationTime(options.expiresIn ?? "15m");
      return builder.sign(options.keyOverride ?? privateKey);
    },
    async otherKey() {
      return (await generateKeyPair("EdDSA")).privateKey;
    },
    close() {
      return new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export const grantBody = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "session-0001",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresInSeconds: 900,
  customer: { id: "customer-uuid", email: "pessoa@exemplo.test", name: "Pessoa" },
  entitlement: {
    status: "ACTIVE",
    licenseId: "license-1",
    planName: "Mensal",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    requestPending: false,
    accessGranted: true,
  },
  release: null,
  ...overrides,
});
