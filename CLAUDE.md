# o-licenciador-client

Biblioteca TypeScript que o backend de um app usa para falar com O Licenciador (`D:\projetos\o-licenciador`). O contrato HTTP está em `docs/integracao-backend-app.md` daquele repositório; este pacote só o implementa. Sem servidor, sem estado, sem retentativa automática.

## Comandos

`pnpm test` (servidor falso real + chaves EdDSA, 40 testes) · `pnpm typecheck` · `pnpm build` (gera `dist/esm` e `dist/cjs`) · `pnpm format` · `pnpm smoke` (contra um Licenciador no ar; veja o README).

## Regras

- **Sem comentários no código** (`//`, `/* */`, JSDoc). Nomes, tipos e testes explicam; o "porquê" que não cabe num nome vai para este arquivo ou o README.
- **`dist/` vai commitado.** Os apps instalam por Git sem compilar. Depois de mudar `src/`, rode `pnpm build` e commite o `dist/` junto, antes de criar a tag.
- **Dois formatos de saída:** ESM em `dist/esm` e CommonJS em `dist/cjs` (cada pasta tem um `package.json` próprio com o `type`), escolhidos pelo campo `exports`. O Prumo e o Prontu podem ser um ou outro.
- **Uma dependência de execução:** `jose` (verificação do JWT). Não adicione outras sem necessidade; `fetch` e `crypto` são do Node.
- **`DENIED` não é erro.** `login` e `refresh` devolvem `GRANTED | DENIED`; só os outros códigos do Licenciador viram `LicensingError`. Falha de rede, timeout e 5xx viram `LicensingUnavailableError` com `outcomeUnknown` (se o Licenciador pode ter processado o pedido). Essa distinção é o que deixa o app decidir entre "tente de novo" e "peça login".
- **Nunca repetir `x-request-id`.** Cada chamada gera um UUID novo; repetir faz o Licenciador responder 409 sem token.
- **Nada de senha ou token em mensagem de erro, `details` ou log.**
- **Mudou o contrato do Licenciador** (código de erro, campo de resposta, claim do token): atualize `src/errors.ts`, `src/parse.ts` ou `src/token.ts`, os testes, o README, rode o `pnpm smoke` e publique versão nova.

## Estrutura

`src/client.ts` (as quatro operações), `src/transport.ts` (cabeçalhos, timeout, classificação de erro de rede), `src/parse.ts` (valida as respostas), `src/token.ts` (JWKS e `verifyAccessToken`), `src/access.ts` (`hasAccess`), `src/errors.ts`, `src/types.ts`. Testes em `test/`, com `test/helpers/fake-server.ts` (servidor HTTP local que também serve o JWKS).

## Estilo

Prettier (`.prettierrc.json`: aspas duplas, vírgula final, 100 colunas). Commits em Conventional Commits.
