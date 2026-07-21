# Deploy no seu VPS

Guia rápido pra colocar o EvoPay Dashboard em produção num VPS Linux (Ubuntu/Debian) com Node.js + Nginx + PM2 + SSL grátis.

## 1. Requisitos no VPS

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential nginx

# Bun (opcional — mais rápido que npm)
curl -fsSL https://bun.sh/install | bash

# PM2 (gerenciador de processos)
sudo npm install -g pm2

# Certbot (SSL grátis)
sudo apt install -y certbot python3-certbot-nginx
```

## 2. Clonar o projeto e instalar

```bash
cd /var/www
git clone <SEU_REPO> evopay-dashboard
cd evopay-dashboard
bun install     # ou: npm install
```

## 3. Configurar o `.env`

Crie `/var/www/evopay-dashboard/.env`:

```dotenv
NODE_ENV=production
PORT=3000

# Sessão — gere uma string aleatória de 32+ caracteres
SESSION_SECRET=troque-por-uma-string-super-aleatoria-de-no-minimo-32-caracteres

# Admin inicial (usado no primeiro seed)
ADMIN_EMAIL=voce@seudominio.com
ADMIN_PASSWORD=troqueEssaSenhaForte123

# EvoPay — token novo (o antigo foi revogado, certo?)
EVOPAY_TOKEN=EP_seu_token_aqui
EVOPAY_BASE_URL=https://api.partners.evopay.cash

# Banco: sqlite em produção, memory em dev
DATA_DRIVER=sqlite
SQLITE_PATH=/var/www/evopay-dashboard/data/app.db
```

## 4. Ativar SQLite + bcrypt no VPS

O preview da Lovable roda em Cloudflare Workers, que não suporta SQLite nativo. Por isso o build vem com apenas o adaptador em memória. Pra ativar SQLite no seu VPS:

```bash
bun add better-sqlite3 bcryptjs node-cron
bun add -d @types/better-sqlite3 @types/bcryptjs
```

Depois, crie o arquivo `src/server/db/sqlite.ts` (não incluído por padrão pra não quebrar o preview) — cole o snippet abaixo:

<details>
<summary>Ver código do adaptador SQLite</summary>

```ts
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AutoPayConfig, DataStore, Transaction, User } from "./schema";

const path = process.env.SQLITE_PATH ?? "./data/app.db";
mkdirSync(dirname(path), { recursive: true });
const db = new Database(path);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, passwordHash TEXT,
  role TEXT, pixKey TEXT, dailyAmount REAL, active INTEGER, createdAt TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, kind TEXT, status TEXT, amount REAL, description TEXT,
  counterparty TEXT, pixKey TEXT, qrCode TEXT, qrImage TEXT, externalId TEXT,
  employeeId TEXT, createdAt TEXT, paidAt TEXT
);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
`);

// Seed admin na primeira execução
const count = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
if (count.c === 0) {
  const email = process.env.ADMIN_EMAIL ?? "admin@evopay.local";
  const pw = process.env.ADMIN_PASSWORD ?? "admin123";
  db.prepare(`INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)`).run(
    "u_admin", email, "Administrador", bcrypt.hashSync(pw, 10),
    "admin", null, null, 1, new Date().toISOString(),
  );
}

// ... implemente os métodos de DataStore usando db.prepare(...)
// Espelhe o comportamento de memory.ts.

export const sqliteStore: DataStore = { /* ... */ } as DataStore;
export const sqlitePassword = {
  hash: (pw: string) => bcrypt.hashSync(pw, 10),
  verify: (pw: string, hash: string) => bcrypt.compareSync(pw, hash),
};
```
</details>

E ajuste `src/server/db/index.ts` pra escolher o adaptador via `DATA_DRIVER`.

## 5. Build e start

```bash
bun run build
pm2 start .output/server/index.mjs --name evopay-dashboard
pm2 save
pm2 startup   # habilita boot automático
```

## 6. Nginx reverse proxy

`/etc/nginx/sites-available/evopay`:

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/evopay /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 7. SSL grátis

```bash
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

## 8. Configurar webhook na EvoPay

No painel da EvoPay, aponte o webhook pra:

```
https://seudominio.com/api/public/evopay/webhook
```

## 9. Cron de pagamentos diários

O toggle "Pagamento automático" na tela de Funcionários salva a config no banco.
Pra rodar de verdade, adicione um job no processo Node. Exemplo com `node-cron`
num arquivo `src/server/cron.server.ts` que você importa no `start.ts`:

```ts
import cron from "node-cron";
import { db } from "./db";
// A cada minuto, verifica se é hora e dispara pagarTodos
cron.schedule("* * * * *", async () => {
  const cfg = await db.getAutoPay();
  if (!cfg.enabled) return;
  const now = new Date();
  if (now.getHours() !== cfg.hour || now.getMinutes() !== cfg.minute) return;
  const today = now.toISOString().slice(0, 10);
  if (cfg.lastRunAt?.startsWith(today)) return;
  // ... chame a lógica do pagarTodos
});
```

## Atualizar depois

```bash
cd /var/www/evopay-dashboard
git pull
bun install
bun run build
pm2 restart evopay-dashboard
```

## Troubleshooting

- **Erro `EVOPAY_TOKEN not configured`** → adicione o token no `.env` e reinicie o PM2.
- **502 Bad Gateway** → `pm2 logs evopay-dashboard`
- **Sessão não persiste** → confira se `SESSION_SECRET` tem 32+ chars e `secure: true` só em HTTPS.
- **Banco perdido** → sempre faça backup de `data/app.db` (é 1 arquivo).
