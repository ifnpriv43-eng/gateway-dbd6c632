-- =====================================================================
-- EvoPay Partner Hub — Schema Postgres (self-hosted VPS)
-- Rode dentro do banco `evopay`, conectado como usuário `evopay`.
--   psql -U evopay -d evopay -f schema.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS app_users (
  id             text PRIMARY KEY,
  email          text NOT NULL UNIQUE,
  name           text NOT NULL,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('admin','funcionario','cliente')),
  pix_key        text,
  daily_amount   numeric,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_users_email_lower_idx ON app_users (lower(email));

CREATE TABLE IF NOT EXISTS app_transactions (
  id            text PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('deposito','saque','pagamento_funcionario')),
  status        text NOT NULL CHECK (status IN ('pendente','pago','expirado','falhou')),
  amount        numeric NOT NULL,
  description   text NOT NULL,
  counterparty  text,
  pix_key       text,
  qr_code       text,
  qr_image      text,
  external_id   text,
  employee_id   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);

CREATE INDEX IF NOT EXISTS app_transactions_created_at_idx  ON app_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS app_transactions_employee_id_idx ON app_transactions (employee_id);
CREATE INDEX IF NOT EXISTS app_transactions_external_id_idx ON app_transactions (external_id);

CREATE TABLE IF NOT EXISTS app_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  token_last4   text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON api_tokens (user_id);

-- =====================================================================
-- Usuário admin inicial
--   Email: ifnprivado@proton.me
--   Senha: 787943
-- (Hash gerado pelo algoritmo interno do app — mesmo formato "sh1$…$len".)
-- =====================================================================
INSERT INTO app_users (id, email, name, password_hash, role, active)
VALUES (
  'u_admin_root',
  'ifnprivado@proton.me',
  'Admin',
  'sh1$dd373f03$6',
  'admin',
  true
)
ON CONFLICT (email) DO NOTHING;
