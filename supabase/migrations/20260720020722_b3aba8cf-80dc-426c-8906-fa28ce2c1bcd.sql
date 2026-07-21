CREATE TABLE public.api_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_last4 text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX api_tokens_user_id_idx ON public.api_tokens(user_id);
CREATE INDEX api_tokens_token_hash_idx ON public.api_tokens(token_hash);

GRANT ALL ON public.api_tokens TO service_role;

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access" ON public.api_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);
