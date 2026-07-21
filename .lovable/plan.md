# API própria + documentação por usuário

Cada cliente/funcionário ganha um **token pessoal** (`pk_...`) e uma **página de documentação** dentro do dashboard. Quando ele integra no sistema dele, os depósitos gerados caem no **saldo interno dele** (não no meu saldo global). Por trás, tudo passa pela minha conta EvoPay usando meu token master — ele nunca vê meu token.

## 1. Tokens de API pessoais

- Nova tabela `api_tokens` (id, user_id, token, name, active, created_at, last_used_at, revoked_at).
- Token gerado como `pk_live_` + 32 chars aleatórios; guardado em hash SHA-256 no banco (só o dono vê o valor completo uma vez, ao criar).
- Cada usuário pode ter vários tokens (ex: "produção", "teste"), revogar e ver a data do último uso.

## 2. Endpoints públicos (`/api/public/v1/*`)

Autenticados via header `Authorization: Bearer pk_live_...`. Todos retornam JSON:

| Método | Rota | O que faz |
|---|---|---|
| `GET`  | `/api/public/v1/balance` | Saldo interno do dono do token (recebido − sacado) |
| `POST` | `/api/public/v1/pix` | Cria depósito Pix. Body: `{ amount, description, payerName?, payerDocument? }`. Retorna `id`, `qrCode`, `qrImage`, `status`. **A transação fica marcada com `employee_id = dono do token`**, então o valor pago cai no saldo interno dele. |
| `GET`  | `/api/public/v1/pix/:id` | Status de um depósito (sincroniza com EvoPay) |
| `POST` | `/api/public/v1/withdraw` | Saque via chave Pix. Body: `{ amount, pixKey, keyType, description? }`. Valida saldo interno do dono antes de enviar. |
| `POST` | `/api/public/v1/withdraw/qrcode` | Saque pagando um QR/copia‑e‑cola |
| `GET`  | `/api/public/v1/withdraw/:id` | Status de um saque |
| `GET`  | `/api/public/v1/transactions` | Lista transações do dono (paginado) |
| `POST` | `/api/public/v1/webhook` | (opcional futuro) URL onde o dono recebe notificações quando um depósito é pago |

Todas as chamadas por trás usam o token master da EvoPay, mas o registro no banco fica com `employee_id` do dono do token → dashboard dele mostra a movimentação, saldo cresce, sacar consome desse saldo. **Igual saques feitos pelo próprio dashboard**.

## 3. Segurança

- Rate limit simples por token (60 req/min, em memória por instância) — evita abuso.
- Validação Zod em todo body.
- Nunca retorna PII de outros usuários; token só enxerga as próprias transações.
- Rota fica em `/api/public/*` (bypass do gate de auth do Lovable), mas o handler exige o Bearer token — sem token válido, `401`.

## 4. Página "Minha API" dentro do dashboard

Nova rota `/app/api` (visível pra admin, funcionário e cliente):

- **Meus tokens**: lista com nome, últimos 4 chars, último uso, botão revogar.
- **Criar token**: modal com nome → mostra o `pk_live_...` completo uma única vez (com botão copiar), aviso "guarde agora, não conseguimos mostrar de novo".
- **Documentação**: seções com exemplos em cURL e JavaScript pra cada endpoint. URL base mostrada dinamicamente (`window.location.origin/api/public/v1`). Todos os exemplos já vêm com **o token do usuário logado** pré‑preenchido, pra ele testar copiando e colando.
- Bloco final "Como funciona": explica em 2 parágrafos que os pagamentos entram automaticamente no saldo dele e podem ser sacados pelo próprio dashboard ou pela API.

## 5. Arquivos que mudam

- Migração: nova tabela `api_tokens` (+ GRANTs + RLS).
- `src/lib/api-tokens.functions.ts` — criar/listar/revogar tokens (server fns, protegidas por sessão).
- `src/server/api-auth.ts` — helper `authenticateApiToken(request)` que resolve o token do header pro `user_id`.
- `src/routes/api/public/v1/*.ts` — 7 rotas HTTP acima.
- `src/routes/_authenticated/app.api.tsx` — página com tokens + documentação (usa componentes shadcn Tabs/Card + syntax highlighting simples).
- `src/components/app-sidebar.tsx` — item "API & Docs" no menu.

## Confirmação

Posso seguir com esse formato? Duas perguntas rápidas antes de codar:

1. **Webhooks pro cliente** (item opcional na tabela): implemento agora ou deixo pra depois?
2. **Taxa/comissão sua** sobre depósitos que caem via API de terceiros: quer que eu já preveja uma % configurável (ex: 2% do depósito fica com você, 98% cai no saldo do cliente)? Ou 100% pro cliente por enquanto?
