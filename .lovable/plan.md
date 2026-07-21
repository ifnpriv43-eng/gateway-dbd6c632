# Plano: Ajuste manual de saldo + Deploy automático via webhook

## Parte 1 — Editar valores das contas (Funcionários & Clientes)

Vou adicionar ao modal **Editar** da tela `/app/funcionarios` uma seção nova: **Ajuste manual de saldo**. O admin poderá:

- **Creditar R$ X** na conta do funcionário/cliente (aumenta o "Disponível pra sacar")
- **Debitar R$ X** (diminui o "Disponível pra sacar")
- Escrever um **motivo** (ex.: "bônus", "correção", "estorno")

Isso não muda a diária automática — a diária continua sendo editada no mesmo modal como já é hoje. É um mecanismo separado, imediato.

### Como funciona por baixo dos panos

Cada ajuste vira uma **transação** normal no extrato do usuário (aparece no Histórico e no "Extrato" da tela dele) com descrição `Ajuste manual: <motivo>`:

- **Crédito** → cria transação `pagamento_funcionario` `pago` com o valor → entra em "Recebido" → aumenta disponível.
- **Débito** → cria transação `saque` `pago` com o valor e sem Pix externo → entra em "Sacado" → diminui disponível.

Vantagem: **não precisa mexer no schema do banco** (nada de migração no Postgres), aproveita toda a lógica de saldo já existente, e o funcionário vê o ajuste no extrato dele. Tudo rastreável.

### Arquivos afetados

- `src/lib/employees.functions.ts` — adicionar server fn `ajustarSaldoFuncionario({ id, tipo: "credito"|"debito", amount, motivo })`, protegida por `requireAdmin`, valida com Zod (valor > 0, motivo min 2 chars), bloqueia débito acima do disponível.
- `src/routes/_authenticated/app.funcionarios.tsx` — no `EditEmployeeDialog`, nova seção "Ajuste de saldo" com: campo valor, radio Crédito/Débito, campo motivo, botão "Aplicar ajuste". Mostra o saldo disponível atual do usuário pra referência.
- Nenhuma mudança no schema/migração.

## Parte 2 — Deploy automático via Webhook do GitHub

Fluxo final:

```text
Lovable edita → push GitHub → GitHub chama VPS → VPS atualiza sozinha (~5s)
```

### O que vou criar

**Endpoint na app:** `src/routes/api/public/deploy-hook.ts` (POST)

- Recebe o webhook do GitHub em `https://seu-dominio/api/public/deploy-hook`
- Verifica assinatura HMAC-SHA256 no header `x-hub-signature-256` com `timingSafeEqual` (impede que qualquer um dispare o deploy)
- Só aceita eventos de push na branch `main`
- Dispara um script em background: `git pull --ff-only && bun install --production && pm2 restart evopay` (nome do processo pega do env)
- Responde 202 imediatamente pro GitHub (não trava o webhook)
- Segredo lido de `process.env.GITHUB_WEBHOOK_SECRET`

**Script auxiliar:** `deploy/webhook-deploy.sh` — o comando que a app dispara. Facilita testar/debugar via `./deploy/webhook-deploy.sh` manual.

### Passos que você faz na VPS (só uma vez)

1. Puxa a nova versão manualmente uma vez: `git pull`
2. Adiciona no `.env` da VPS:
   ```
   GITHUB_WEBHOOK_SECRET=<uma_string_aleatoria_forte>
   PM2_PROCESS_NAME=evopay
   REPO_DIR=/var/www/evopay/new-repo
   ```
   Pra gerar a string: `openssl rand -hex 32`
3. Dá permissão de execução: `chmod +x deploy/webhook-deploy.sh`
4. Reinicia o pm2: `pm2 restart evopay --update-env`

### Passos no GitHub (só uma vez)

1. Vai no repo → **Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://SEU_DOMINIO/api/public/deploy-hook`
3. **Content type:** `application/json`
4. **Secret:** a mesma string do `GITHUB_WEBHOOK_SECRET`
5. **Which events:** só o evento **push** (Just the push event)
6. **Active:** ✅
7. Salvar

### Segurança

- Endpoint público (`/api/public/*`) mas exige assinatura HMAC válida do GitHub — sem o secret ninguém dispara.
- Compara assinatura com `timingSafeEqual` (evita timing attack).
- Só aceita pushes na branch `main` (ignora feature branches, tags).
- Log de cada disparo com IP e commit SHA em stdout do pm2 pra auditoria.
- Se o `git pull` ou `bun install` falhar, o pm2 mantém a versão antiga rodando.

### Observação importante

O endpoint executa `child_process.spawn` na tua VPS (Node.js). Isso funciona porque o app roda em Node via pm2, não em serverless. Se um dia migrar pra Cloudflare Workers ou similar, esse fluxo não vai funcionar — mas hoje está tudo certo.

## Ordem de aplicação

1. Faço as duas alterações no clone local.
2. Você aplica via `git pull` na VPS uma vez (por enquanto ainda manual, esse mesmo pull já ativa o webhook).
3. Configura o segredo `.env` + webhook no GitHub.
4. A partir daí, todo push da Lovable atualiza a VPS sozinho.

Confirma que posso seguir?