import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  createLicensingClient,
  isLicensingError,
  isUnavailable,
  LicensingError,
  type LicensingClient,
} from "../src/index.js";
import { type FakeServer, grantBody, startFakeServer } from "./helpers/fake-server.js";

const REGISTER = "/v1/credentials/register";
const LOGIN = "/v1/credentials/login";
const REFRESH = "/v1/credentials/refresh";
const LOGOUT = "/v1/credentials/logout";

let server: FakeServer;
let client: LicensingClient;

const credentials = { clientId: "app_test", clientSecret: "lsk_segredo" };

before(async () => {
  server = await startFakeServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
  client = createLicensingClient({ baseUrl: server.url, ...credentials, timeoutMs: 2000 });
});

const login = () =>
  client.login({
    email: "pessoa@exemplo.test",
    password: "senha-1234",
    deviceId: "device-0001",
    deviceName: "Celular",
  });

describe("cabeçalhos e corpo", () => {
  it("manda o Client ID, a chave de serviço e um x-request-id novo a cada chamada", async () => {
    server.reply(LOGIN, { status: 200, body: grantBody() });

    await login();
    await login();

    assert.equal(server.requests.length, 2);
    const [first, second] = server.requests;
    assert.equal(first?.headers["x-app-id"], "app_test");
    assert.equal(first?.headers["x-app-secret"], "lsk_segredo");
    const ids = server.requests.map((request) => String(request.headers["x-request-id"]));
    assert.match(ids[0] ?? "", /^[A-Za-z0-9_-]{8,128}$/);
    assert.notEqual(ids[0], ids[1]);
    assert.equal(second?.headers["x-end-user-ip"], undefined);
  });

  it("repassa o IP do usuário final quando informado", async () => {
    server.reply(LOGIN, { status: 200, body: grantBody() });

    await client.login({
      email: "a@b.test",
      password: "x",
      deviceId: "device-0001",
      clientIp: "203.0.113.7",
    });

    assert.equal(server.requests[0]?.headers["x-end-user-ip"], "203.0.113.7");
  });

  it("não manda deviceName quando não foi informado", async () => {
    server.reply(LOGIN, { status: 200, body: grantBody() });

    await client.login({ email: "a@b.test", password: "x", deviceId: "device-0001" });

    assert.deepEqual(server.requests[0]?.body, {
      email: "a@b.test",
      password: "x",
      deviceId: "device-0001",
    });
  });
});

describe("register", () => {
  it("devolve o cliente criado", async () => {
    server.reply(REGISTER, {
      status: 201,
      body: { id: "customer-uuid", email: "pessoa@exemplo.test", name: "Pessoa" },
    });

    const customer = await client.register({
      email: "pessoa@exemplo.test",
      password: "senha-1234",
      name: "Pessoa",
    });

    assert.deepEqual(customer, {
      id: "customer-uuid",
      email: "pessoa@exemplo.test",
      name: "Pessoa",
    });
  });

  it("e-mail repetido vira LicensingError com o código do Licenciador", async () => {
    server.reply(REGISTER, {
      status: 409,
      body: { code: "EMAIL_ALREADY_REGISTERED", message: "Email already registered" },
    });

    await assert.rejects(
      client.register({ email: "a@b.test", password: "senha-1234", name: "A" }),
      (error: unknown) =>
        isLicensingError(error, "EMAIL_ALREADY_REGISTERED") &&
        (error as LicensingError).status === 409,
    );
  });
});

describe("login", () => {
  it("devolve GRANTED com a sessão e o entitlement", async () => {
    server.reply(LOGIN, { status: 200, body: grantBody() });

    const result = await login();

    assert.equal(result.status, "GRANTED");
    if (result.status !== "GRANTED") return;
    assert.equal(result.grant.sessionId, "session-0001");
    assert.equal(result.grant.accessToken, "access-token");
    assert.equal(result.grant.refreshToken, "refresh-token");
    assert.equal(result.grant.entitlement.status, "ACTIVE");
    assert.equal(result.grant.entitlement.accessGranted, true);
    assert.equal(result.grant.release, null);
  });

  it("traz a liberação manual quando houver, inclusive acesso total sem licença", async () => {
    server.reply(LOGIN, {
      status: 200,
      body: grantBody({
        entitlement: {
          status: "ACTIVE",
          licenseId: null,
          planName: null,
          startsAt: null,
          expiresAt: null,
          requestPending: false,
          accessGranted: true,
        },
        release: { action: "FULL_ACCESS", expiresAt: null },
      }),
    });

    const result = await login();

    assert.equal(result.status, "GRANTED");
    if (result.status !== "GRANTED") return;
    assert.deepEqual(result.grant.release, { action: "FULL_ACCESS", expiresAt: null });
    assert.equal(result.grant.entitlement.licenseId, null);
  });

  it("403 ACCESS_DENIED vira DENIED com os impedimentos, sem lançar", async () => {
    server.reply(LOGIN, {
      status: 403,
      body: {
        code: "ACCESS_DENIED",
        message: "Access denied",
        impediments: [
          { code: null, message: "Acesso indisponível no momento." },
          { code: "ASSINATURA_VENCIDA", message: "Sua assinatura venceu." },
        ],
      },
    });

    const result = await login();

    assert.deepEqual(result, {
      status: "DENIED",
      impediments: [
        { code: null, message: "Acesso indisponível no momento." },
        { code: "ASSINATURA_VENCIDA", message: "Sua assinatura venceu." },
      ],
    });
  });

  it("senha errada lança INVALID_CREDENTIALS", async () => {
    server.reply(LOGIN, {
      status: 401,
      body: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
    });

    await assert.rejects(login(), (error: unknown) =>
      isLicensingError(error, "INVALID_CREDENTIALS"),
    );
  });

  it("muitas tentativas lança TOO_MANY_ATTEMPTS com status 429", async () => {
    server.reply(LOGIN, {
      status: 429,
      body: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" },
    });

    await assert.rejects(
      login(),
      (error: unknown) =>
        isLicensingError(error, "TOO_MANY_ATTEMPTS") && (error as LicensingError).status === 429,
    );
  });

  it("outros códigos de recusa seguem como erro, não como DENIED", async () => {
    for (const code of [
      "PASSWORD_CHANGE_REQUIRED",
      "CUSTOMER_DISABLED",
      "APP_INACTIVE",
      "NEW_LOGINS_BLOCKED",
    ]) {
      server.reply(LOGIN, { status: 403, body: { code, message: code } });
      await assert.rejects(login(), (error: unknown) => isLicensingError(error, code as never));
    }
  });

  it("chave de serviço errada lança UNAUTHORIZED", async () => {
    server.reply(LOGIN, { status: 401, body: { statusCode: 401, message: "Unauthorized" } });

    await assert.rejects(login(), (error: unknown) => isLicensingError(error, "UNAUTHORIZED"));
  });

  it("x-request-id repetido lança REQUEST_ALREADY_PROCESSED", async () => {
    server.reply(LOGIN, {
      status: 409,
      body: { code: "REQUEST_ALREADY_PROCESSED", message: "Request already processed" },
    });

    await assert.rejects(login(), (error: unknown) =>
      isLicensingError(error, "REQUEST_ALREADY_PROCESSED"),
    );
  });

  it("corpo de sucesso fora do contrato lança UNEXPECTED_RESPONSE", async () => {
    server.reply(LOGIN, { status: 200, body: { sessionId: "x" } });

    await assert.rejects(login(), (error: unknown) =>
      isLicensingError(error, "UNEXPECTED_RESPONSE"),
    );
  });

  it("validação do corpo (400) lança BAD_REQUEST com os detalhes", async () => {
    server.reply(LOGIN, {
      status: 400,
      body: { message: [{ path: ["email"], message: "Invalid email" }], statusCode: 400 },
    });

    await assert.rejects(login(), (error: unknown) => {
      return (
        isLicensingError(error, "BAD_REQUEST") && (error as LicensingError).details !== undefined
      );
    });
  });
});

describe("refresh e logout", () => {
  it("refresh devolve o grant novo", async () => {
    server.reply(REFRESH, {
      status: 200,
      body: grantBody({ refreshToken: "refresh-novo" }),
    });

    const result = await client.refresh({ refreshToken: "refresh-token" });

    assert.equal(result.status, "GRANTED");
    if (result.status !== "GRANTED") return;
    assert.equal(result.grant.refreshToken, "refresh-novo");
    assert.deepEqual(server.requests[0]?.body, { refreshToken: "refresh-token" });
  });

  it("refresh com licença vencida volta como DENIED", async () => {
    server.reply(REFRESH, {
      status: 403,
      body: {
        code: "ACCESS_DENIED",
        message: "Access denied",
        impediments: [{ code: "ASSINATURA_VENCIDA", message: "Sua assinatura venceu." }],
      },
    });

    const result = await client.refresh({ refreshToken: "refresh-token" });

    assert.equal(result.status, "DENIED");
  });

  it("refresh token já trocado lança INVALID_REFRESH_TOKEN", async () => {
    server.reply(REFRESH, {
      status: 401,
      body: { code: "INVALID_REFRESH_TOKEN", message: "Invalid refresh token" },
    });

    await assert.rejects(client.refresh({ refreshToken: "velho" }), (error: unknown) =>
      isLicensingError(error, "INVALID_REFRESH_TOKEN"),
    );
  });

  it("logout responde 204 e não devolve nada", async () => {
    server.reply(LOGOUT, { status: 204 });

    assert.equal(await client.logout({ refreshToken: "refresh-token" }), undefined);
    assert.deepEqual(server.requests[0]?.body, { refreshToken: "refresh-token" });
  });
});

describe("Licenciador fora do ar", () => {
  it("5xx lança LicensingUnavailableError com resultado desconhecido", async () => {
    server.reply(LOGIN, { status: 503, body: { message: "indisponível" } });

    await assert.rejects(login(), (error: unknown) => {
      return isUnavailable(error) && error.outcomeUnknown && error.status === 503;
    });
  });

  it("timeout lança LicensingUnavailableError com resultado desconhecido", async () => {
    server.reply(LOGIN, { status: 200, body: grantBody(), delayMs: 400 });
    const impatient = createLicensingClient({
      baseUrl: server.url,
      ...credentials,
      timeoutMs: 50,
    });

    await assert.rejects(
      impatient.login({ email: "a@b.test", password: "x", deviceId: "device-0001" }),
      (error: unknown) => isUnavailable(error) && error.outcomeUnknown,
    );
  });

  it("conexão recusada lança LicensingUnavailableError sabendo que nada foi processado", async () => {
    const dead = await startFakeServer();
    const url = dead.url;
    await dead.close();
    const offline = createLicensingClient({ baseUrl: url, ...credentials, timeoutMs: 1000 });

    await assert.rejects(
      offline.refresh({ refreshToken: "refresh-token" }),
      (error: unknown) => isUnavailable(error) && !error.outcomeUnknown,
    );
  });
});

describe("configuração", () => {
  it("recusa baseUrl inválida e credenciais vazias", () => {
    assert.throws(() => createLicensingClient({ baseUrl: "nao-e-url", ...credentials }), TypeError);
    assert.throws(
      () => createLicensingClient({ baseUrl: "ftp://exemplo.test", ...credentials }),
      TypeError,
    );
    assert.throws(
      () => createLicensingClient({ baseUrl: server.url, clientId: "", clientSecret: "x" }),
      TypeError,
    );
    assert.throws(
      () => createLicensingClient({ baseUrl: server.url, clientId: "app", clientSecret: " " }),
      TypeError,
    );
  });

  it("aceita barra no fim da baseUrl", async () => {
    server.reply(LOGIN, { status: 200, body: grantBody() });
    const slashed = createLicensingClient({ baseUrl: `${server.url}/`, ...credentials });

    const result = await slashed.login({
      email: "a@b.test",
      password: "x",
      deviceId: "device-0001",
    });

    assert.equal(result.status, "GRANTED");
    assert.equal(server.requests[0]?.path, LOGIN);
  });

  it("aceita um requestId e um fetch próprios", async () => {
    const seen: string[] = [];
    const custom = createLicensingClient({
      baseUrl: "http://licenciador.local",
      ...credentials,
      requestId: () => "id-fixo-0001",
      fetch: async (input, init) => {
        seen.push(input, String((init.headers as Record<string, string>)["x-request-id"]));
        return new Response(JSON.stringify(grantBody()), { status: 200 });
      },
    });

    await custom.login({ email: "a@b.test", password: "x", deviceId: "device-0001" });

    assert.deepEqual(seen, ["http://licenciador.local/v1/credentials/login", "id-fixo-0001"]);
  });
});
