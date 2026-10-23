# o-licenciador-client

Cliente para o **backend de um app** falar com O Licenciador: cadastro, login, renovação de sessão, logout e verificação do access token.

É só código TypeScript (compilado para JavaScript, ESM e CommonJS): uma biblioteca que o backend do app importa, sem servidor próprio e sem guardar nada. O app do usuário nunca fala com o Licenciador, só o backend dele; este pacote é o jeito de o backend fazer isso sem reescrever os cabeçalhos, os erros e a verificação do token em cada app.

O contrato HTTP que ele implementa está em `docs/integracao-backend-app.md` do repositório do Licenciador.

## Instalar

O pacote não está num registro público. Instale pelo GitHub, fixando uma tag:

```bash
pnpm add github:SEU_USUARIO/o-licenciador-client#v0.1.0
```

A pasta `dist/` vai commitada de propósito: assim a instalação por Git funciona sem precisar compilar. Requer Node 18.17 ou mais novo (usa `fetch` nativo).

## Usar

```ts
import { createLicensingClient, hasAccess } from "o-licenciador-client";

const licensing = createLicensingClient({
  baseUrl: process.env.LICENSING_URL!,
  clientId: process.env.LICENSING_CLIENT_ID!,
  clientSecret: process.env.LICENSING_CLIENT_SECRET!,
});
```

Crie **um** cliente por processo e reaproveite. As três variáveis vêm do cadastro do app no painel do Licenciador (Client ID e chave de serviço, que aparece uma vez).

### Cadastro e login

```ts
const customer = await licensing.register({ email, password, name, clientIp });

const result = await licensing.login({ email, password, deviceId, deviceName, clientIp });

if (result.status === "GRANTED") {
  const { grant } = result;
  // grant.accessToken, grant.refreshToken, grant.sessionId, grant.entitlement, grant.release
} else {
  // result.impediments: [{ code: string | null, message: string }]
}
```

- `register` não emite token: faça o `login` em seguida.
- `login` e `refresh` devolvem `GRANTED` ou `DENIED`. **`DENIED` não é erro**: é o credenciamento dizendo que o usuário não está apto. Mostre `message`; use `code` só quando não for `null` (o `null` quer dizer "não exiba o motivo").
- Passe o `clientIp` do usuário final quando tiver (o IP que o seu backend viu): o Licenciador usa para registrar a chamada e limitar tentativas.

### Renovar a sessão e sair

```ts
const next = await licensing.refresh({ refreshToken });
await licensing.logout({ refreshToken });
```

`refresh` devolve um refresh token **novo** e invalida o antigo: grave o novo a cada uso. `logout` encerra a sessão inteira e não falha por token desconhecido.

### Verificar o access token

```ts
const claims = await licensing.verifyAccessToken(accessToken);

if (!hasAccess(claims)) {
  // sem acesso (licença vencida, liberação vencida...)
}
```

A verificação é offline: o pacote busca as chaves públicas em `/.well-known/jwks.json` (com cache), confere a assinatura EdDSA, o `aud` (tem de ser o seu Client ID) e a validade. `claims` traz `customerId`, `email`, `name`, `appId`, `sessionId`, `entitlement`, `release`, `issuedAt` e `expiresAt`.

`hasAccess` aceita o `grant` do login ou as `claims`. Quando há `release` (liberação manual, inclusive acesso total), vale o prazo dela e **não** exige licença nem `entitlement.expiresAt`.

## Erros

Há dois tipos, e a diferença importa.

**`LicensingError`** (o Licenciador respondeu e recusou): tem `code`, `status`, `message` e `details`.

| `code`                                          | O que fazer                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `INVALID_CREDENTIALS`                           | E-mail ou senha errados.                                                                                         |
| `INVALID_REFRESH_TOKEN`                         | Sessão encerrada: peça login de novo.                                                                            |
| `PASSWORD_CHANGE_REQUIRED`                      | O admin precisa redefinir a senha do cliente.                                                                    |
| `CUSTOMER_DISABLED`                             | Conta desativada.                                                                                                |
| `APP_INACTIVE`                                  | App desativado no Licenciador.                                                                                   |
| `NEW_LOGINS_BLOCKED` / `NEW_USERS_BLOCKED`      | Bloqueios do app.                                                                                                |
| `REGISTRATION_CLOSED`                           | Cadastro global fechado.                                                                                         |
| `EMAIL_ALREADY_REGISTERED`                      | E-mail já cadastrado neste app.                                                                                  |
| `TOO_MANY_ATTEMPTS`                             | Muitas senhas erradas para o cliente ou o IP (HTTP 429).                                                         |
| `REQUEST_ALREADY_PROCESSED`                     | Esse `x-request-id` já foi usado (o pacote gera um novo a cada chamada, então indica bug ou retentativa manual). |
| `UNAUTHORIZED`                                  | Client ID ou chave de serviço errados: erro de configuração.                                                     |
| `BAD_REQUEST`                                   | Corpo recusado; `details` traz o motivo.                                                                         |
| `INVALID_ACCESS_TOKEN` / `ACCESS_TOKEN_EXPIRED` | Só em `verifyAccessToken`.                                                                                       |
| `UNEXPECTED_RESPONSE`                           | Resposta fora do contrato.                                                                                       |

```ts
import { isLicensingError } from "o-licenciador-client";

try {
  await licensing.login(input);
} catch (error) {
  if (isLicensingError(error, "INVALID_CREDENTIALS")) {
    /* 401 para o seu usuário */
  }
}
```

**`LicensingUnavailableError`** (o Licenciador não respondeu: rede, timeout ou 5xx): mostre "tente de novo". Tem `outcomeUnknown`:

- `false`: a conexão nem chegou ao servidor (recusada, DNS). **Nada foi processado**: pode tentar de novo, inclusive com o mesmo refresh token.
- `true`: o pedido pode ter sido processado e a resposta se perdeu. Num **login**, peça a senha de novo. Num **refresh**, o refresh token antigo pode já ter sido trocado e o novo foi perdido: trate como sessão encerrada e peça login. Não reenvie o mesmo refresh token: reusar um token já trocado depois de 30 segundos é tratado como roubo e derruba a sessão.

```ts
import { isUnavailable } from "o-licenciador-client";

try {
  await licensing.refresh({ refreshToken });
} catch (error) {
  if (isUnavailable(error) && !error.outcomeUnknown) {
    /* tentar de novo mais tarde */
  }
}
```

Em `verifyAccessToken`, falha ao buscar as chaves vira `LicensingUnavailableError` com `outcomeUnknown: false`.

## Regras que o seu backend precisa respeitar

- **Guarde os tokens no backend.** O refresh token fica cifrado, por sessão, no banco do app. O app do usuário recebe uma sessão do **seu** backend, nunca os tokens do Licenciador.
- **Nunca registre senha, access token nem refresh token** em log.
- **Licenciador fora do ar = credenciamento falha.** Sessões abertas seguem até o access token vencer; a revogação só vale quando ele vence.
- O pacote gera um `x-request-id` novo (UUID) a cada chamada e **nunca repete**. Não há retentativa automática: quem decide é o seu código, com base nas regras de `outcomeUnknown`.

## Opções

```ts
createLicensingClient({
  baseUrl,
  clientId,
  clientSecret,
  timeoutMs: 10_000,
  fetch: customFetch,
  requestId: () => "id-fixo-para-teste",
  jwks: localKeySet,
  clockToleranceSeconds: 5,
});
```

`fetch`, `requestId` e `jwks` existem para testes do seu app: troque por falsos sem subir o Licenciador.

## Desenvolvimento

```bash
pnpm install
pnpm test        # 40 testes, com um servidor falso e chaves EdDSA reais
pnpm typecheck
pnpm build       # gera dist/esm e dist/cjs
pnpm format
```

Teste de ponta a ponta contra um Licenciador no ar (cria um cliente de teste, concede acesso total pelo painel e percorre cadastro, login, token, refresh, reuso e logout):

```bash
LICENCIADOR_URL=http://localhost:4310 \
CLIENT_ID=app_xxx CLIENT_SECRET=lsk_xxx \
ADMIN_EMAIL=... ADMIN_PASSWORD=... \
pnpm smoke
```

Sem as variáveis de admin, roda só os passos que não precisam delas.

### Publicar uma versão

1. `pnpm test && pnpm build`
2. Atualize `version` no `package.json` e commite **incluindo `dist/`**.
3. `git tag v0.1.1 && git push --tags`
4. Nos apps: `pnpm add github:SEU_USUARIO/o-licenciador-client#v0.1.1`

Mudanças no contrato do Licenciador (código de erro novo, campo novo na resposta) pedem uma versão nova do pacote e a atualização dos apps.
