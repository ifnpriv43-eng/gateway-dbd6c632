
CREATE TABLE public.app_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','funcionario')),
  pix_key text,
  daily_amount numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_transactions (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('deposito','saque','pagamento_funcionario')),
  status text NOT NULL CHECK (status IN ('pendente','pago','expirado','falhou')),
  amount numeric(12,2) NOT NULL,
  description text NOT NULL,
  counterparty text,
  pix_key text,
  qr_code text,
  qr_image text,
  external_id text UNIQUE,
  employee_id text REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX app_transactions_kind_idx ON public.app_transactions(kind);
CREATE INDEX app_transactions_status_idx ON public.app_transactions(status);
CREATE INDEX app_transactions_employee_idx ON public.app_transactions(employee_id);
GRANT ALL ON public.app_transactions TO service_role;
ALTER TABLE public.app_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_users (id,email,name,password_hash,role,pix_key,daily_amount,active) VALUES
  ('u_admin','admin@evopay.local','Administrador','sh1$a63f45da$8','admin',NULL,NULL,true),
  ('u_maria','maria@evopay.local','Maria Silva','sh1$5bf57243$8','funcionario','maria@evopay.local',50,true),
  ('u_joao','joao@evopay.local','João Santos','sh1$ca399e9e$7','funcionario','11999998888',30,true);

INSERT INTO public.app_config(key,value) VALUES ('autopay','{"enabled":false,"hour":9,"minute":0}'::jsonb);
