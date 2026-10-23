import { randomBytes } from "node:crypto";

import {
  createLicensingClient,
  hasAccess,
  isLicensingError,
  isUnavailable,
} from "../dist/esm/index.js";

const baseUrl = process.env.LICENCIADOR_URL ?? "http://localhost:4310";
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!clientId || !clientSecret) {
  console.error(
    "Defina CLIENT_ID e CLIENT_SECRET (e, para o teste completo, ADMIN_EMAIL e ADMIN_PASSWORD)",
  );
  process.exit(1);
}

let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
}

async function attempt(promise) {
  try {
    return { value: await promise };
  } catch (error) {
    return { error };
  }
}

const suffix = randomBytes(4).toString("hex");
const email = `cliente-pacote-${suffix}@exemplo.test`;
const password = randomBytes(12).toString("base64url");
const deviceId = `device-pacote-${suffix}`;

const client = createLicensingClient({ baseUrl, clientId, clientSecret });

const registered = await attempt(client.register({ email, password, name: "Cliente do pacote" }));
check("cadastro devolve o cliente", registered.value?.email === email, registered);

const duplicate = await attempt(client.register({ email, password, name: "Cliente do pacote" }));
check(
  "e-mail repetido vira EMAIL_ALREADY_REGISTERED",
  isLicensingError(duplicate.error, "EMAIL_ALREADY_REGISTERED"),
  duplicate.error?.message,
);

const wrong = await attempt(client.login({ email, password: "errada-1234", deviceId }));
check(
  "senha errada vira INVALID_CREDENTIALS",
  isLicensingError(wrong.error, "INVALID_CREDENTIALS"),
  wrong.error?.message,
);

const denied = await attempt(client.login({ email, password, deviceId, deviceName: "Teste" }));
check(
  "sem licença o login volta DENIED com mensagem",
  denied.value?.status === "DENIED" && typeof denied.value.impediments?.[0]?.message === "string",
  denied.value,
);

const badSecret = createLicensingClient({ baseUrl, clientId, clientSecret: "lsk_errada" });
const unauthorized = await attempt(badSecret.login({ email, password, deviceId }));
check(
  "chave de serviço errada vira UNAUTHORIZED",
  isLicensingError(unauthorized.error, "UNAUTHORIZED"),
  unauthorized.error?.message,
);

const offline = createLicensingClient({
  baseUrl: "http://127.0.0.1:9",
  clientId,
  clientSecret,
  timeoutMs: 1500,
});
const unreachable = await attempt(offline.refresh({ refreshToken: "qualquer" }));
check(
  "servidor fora do ar vira LicensingUnavailableError",
  isUnavailable(unreachable.error),
  unreachable.error?.message,
);

if (!adminEmail || !adminPassword) {
  console.log("skip passos que exigem admin (defina ADMIN_EMAIL e ADMIN_PASSWORD)");
} else {
  const admin = async (method, path, body, token) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  const session = await admin("POST", "/admin/auth/login", {
    email: adminEmail,
    password: adminPassword,
  });
  const token = session.body?.accessToken;
  check("login do admin", session.status === 200 && !!token, session.status);

  const apps = await admin("GET", "/admin/apps", undefined, token);
  const app = apps.body?.find?.((item) => item.clientId === clientId);
  check("o app do Client ID existe", !!app, apps.status);

  const grant = await admin(
    "POST",
    "/admin/releases/full-access",
    { customerId: registered.value?.id, appId: app?.id, note: "Smoke do pacote cliente" },
    token,
  );
  check("admin concede acesso total", grant.status === 200, grant.body);

  const granted = await attempt(client.login({ email, password, deviceId, deviceName: "Teste" }));
  const result = granted.value;
  check(
    "com acesso total o login volta GRANTED",
    result?.status === "GRANTED",
    granted.error?.message ?? result,
  );

  if (result?.status === "GRANTED") {
    check(
      "o grant traz a liberação FULL_ACCESS e entitlement ACTIVE",
      result.grant.release?.action === "FULL_ACCESS" &&
        result.grant.entitlement.status === "ACTIVE",
      result.grant,
    );

    const claims = await attempt(client.verifyAccessToken(result.grant.accessToken));
    check(
      "o access token confere com as chaves do Licenciador",
      claims.value?.sessionId === result.grant.sessionId &&
        claims.value.customerId === registered.value.id &&
        claims.value.release?.action === "FULL_ACCESS",
      claims.error?.message ?? claims.value,
    );
    check("hasAccess libera", claims.value ? hasAccess(claims.value) : false);

    const otherApp = createLicensingClient({
      baseUrl,
      clientId: "app_outro_cliente",
      clientSecret,
    });
    const wrongAudience = await attempt(otherApp.verifyAccessToken(result.grant.accessToken));
    check(
      "o token não vale para outro Client ID",
      isLicensingError(wrongAudience.error, "INVALID_ACCESS_TOKEN"),
      wrongAudience.error?.message,
    );

    const refreshed = await attempt(client.refresh({ refreshToken: result.grant.refreshToken }));
    check(
      "refresh mantém a sessão e troca o refresh token",
      refreshed.value?.status === "GRANTED" &&
        refreshed.value.grant.sessionId === result.grant.sessionId &&
        refreshed.value.grant.refreshToken !== result.grant.refreshToken,
      refreshed.error?.message ?? refreshed.value,
    );

    const reused = await attempt(client.refresh({ refreshToken: result.grant.refreshToken }));
    check(
      "refresh token já trocado vira INVALID_REFRESH_TOKEN",
      isLicensingError(reused.error, "INVALID_REFRESH_TOKEN"),
      reused.error?.message,
    );

    const lastToken =
      refreshed.value?.status === "GRANTED" ? refreshed.value.grant.refreshToken : "";
    const loggedOut = await attempt(client.logout({ refreshToken: lastToken }));
    check("logout responde sem erro", loggedOut.error === undefined, loggedOut.error?.message);

    const afterLogout = await attempt(client.refresh({ refreshToken: lastToken }));
    check(
      "refresh depois do logout vira INVALID_REFRESH_TOKEN",
      isLicensingError(afterLogout.error, "INVALID_REFRESH_TOKEN"),
      afterLogout.error?.message,
    );
  }
}

console.log(failures === 0 ? "\nTUDO CERTO" : `\n${failures} falha(s)`);
process.exit(failures === 0 ? 0 : 1);
