import assert from "node:assert/strict";
import { createLocalJWKSet } from "jose";
import { after, before, describe, it } from "node:test";

import {
  createLicensingClient,
  isLicensingError,
  isUnavailable,
  type LicensingClient,
} from "../src/index.js";
import { type FakeServer, startFakeServer } from "./helpers/fake-server.js";

let server: FakeServer;
let client: LicensingClient;

before(async () => {
  server = await startFakeServer();
  client = createLicensingClient({
    baseUrl: server.url,
    clientId: "app_test",
    clientSecret: "lsk_segredo",
  });
});

after(async () => {
  await server.close();
});

describe("verifyAccessToken", () => {
  it("aceita um token válido e devolve as claims tipadas", async () => {
    const token = await server.signToken();

    const claims = await client.verifyAccessToken(token);

    assert.equal(claims.customerId, "customer-uuid");
    assert.equal(claims.email, "pessoa@exemplo.test");
    assert.equal(claims.appSlug, "prumo");
    assert.equal(claims.sessionId, "session-0001");
    assert.equal(claims.deviceId, "device-0001");
    assert.equal(claims.entitlement.status, "ACTIVE");
    assert.equal(claims.entitlement.planName, "Mensal");
    assert.equal(claims.release, null);
    assert.ok(claims.expiresAt.getTime() > Date.now());
    assert.ok(claims.issuedAt.getTime() <= Date.now());
  });

  it("devolve a liberação manual do token", async () => {
    const token = await server.signToken({
      claims: { release: { action: "PERIOD", expiresAt: "2099-01-01T00:00:00.000Z" } },
    });

    const claims = await client.verifyAccessToken(token);

    assert.deepEqual(claims.release, { action: "PERIOD", expiresAt: "2099-01-01T00:00:00.000Z" });
  });

  it("recusa token de outro app (aud diferente)", async () => {
    const token = await server.signToken({ audience: "app_outro" });

    await assert.rejects(client.verifyAccessToken(token), (error: unknown) =>
      isLicensingError(error, "INVALID_ACCESS_TOKEN"),
    );
  });

  it("recusa token vencido com um código próprio", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await server.signToken({ issuedAt: past - 900, expiresIn: past });

    await assert.rejects(client.verifyAccessToken(token), (error: unknown) =>
      isLicensingError(error, "ACCESS_TOKEN_EXPIRED"),
    );
  });

  it("recusa token assinado com outra chave", async () => {
    const token = await server.signToken({ keyOverride: await server.otherKey() });

    await assert.rejects(client.verifyAccessToken(token), (error: unknown) =>
      isLicensingError(error, "INVALID_ACCESS_TOKEN"),
    );
  });

  it("recusa token de admin e token sem as claims esperadas", async () => {
    const admin = await server.signToken({ claims: { role: "admin" } });
    const noSession = await server.signToken({ claims: { sessionId: undefined } });

    for (const token of [admin, noSession]) {
      await assert.rejects(client.verifyAccessToken(token), (error: unknown) =>
        isLicensingError(error, "INVALID_ACCESS_TOKEN"),
      );
    }
  });

  it("recusa lixo e texto vazio", async () => {
    for (const token of ["isto-nao-e-jwt", "a.b.c", ""]) {
      await assert.rejects(client.verifyAccessToken(token), (error: unknown) =>
        isLicensingError(error, "INVALID_ACCESS_TOKEN"),
      );
    }
  });

  it("recusa token sem assinatura (alg none)", async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({
      sub: "x",
      aud: "app_test",
      role: "customer",
    })}.`;

    await assert.rejects(client.verifyAccessToken(token), (error: unknown) =>
      isLicensingError(error, "INVALID_ACCESS_TOKEN"),
    );
  });

  it("sem acesso às chaves do Licenciador lança LicensingUnavailableError", async () => {
    const dead = await startFakeServer();
    const url = dead.url;
    const token = await dead.signToken();
    await dead.close();
    const offline = createLicensingClient({
      baseUrl: url,
      clientId: "app_test",
      clientSecret: "lsk_segredo",
    });

    await assert.rejects(offline.verifyAccessToken(token), (error: unknown) =>
      isUnavailable(error),
    );
  });

  it("aceita um conjunto de chaves local, sem buscar na rede", async () => {
    const jwks = createLocalJWKSet({ keys: [] });
    const local = createLicensingClient({
      baseUrl: server.url,
      clientId: "app_test",
      clientSecret: "lsk_segredo",
      jwks,
    });
    const token = await server.signToken();

    await assert.rejects(local.verifyAccessToken(token), (error: unknown) =>
      isLicensingError(error, "INVALID_ACCESS_TOKEN"),
    );
  });
});
