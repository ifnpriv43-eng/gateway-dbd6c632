// Postgres connection singleton (postgres.js). Server-only.
// Ativado quando process.env.DATABASE_URL está setado (deploy self-hosted).
import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  _sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    prepare: false,
  });
  return _sql;
}
