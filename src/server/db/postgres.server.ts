// Postgres-backed DataStore (self-hosted VPS). Server-only.
// Usa a mesma forma de "app_users / app_transactions / app_config" das migrations,
// mas contra um Postgres que você mesmo hospeda.
import type postgres from "postgres";
import type { AutoPayConfig, DataStore, Transaction, TxKind, TxStatus, User, UserRole } from "./schema";
import { getSql } from "./pg.server";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function simpleHash(pw: string) {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h) ^ pw.charCodeAt(i);
  return `sh1$${(h >>> 0).toString(16)}$${pw.length}`;
}
function verifySimple(pw: string, hash: string) {
  return simpleHash(pw) === hash;
}

type UserRow = {
  id: string; email: string; name: string; password_hash: string; role: UserRole;
  pix_key: string | null; daily_amount: string | number | null; active: boolean; created_at: string;
};
function userFromRow(r: UserRow): User {
  return {
    id: r.id, email: r.email, name: r.name, passwordHash: r.password_hash, role: r.role,
    pixKey: r.pix_key ?? undefined,
    dailyAmount: r.daily_amount == null ? undefined : Number(r.daily_amount),
    active: r.active,
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at as unknown as string).toISOString(),
  };
}

type TxRow = {
  id: string; kind: TxKind; status: TxStatus; amount: string | number; description: string;
  counterparty: string | null; pix_key: string | null; qr_code: string | null; qr_image: string | null;
  external_id: string | null; employee_id: string | null; created_at: string; paid_at: string | null;
};
function txFromRow(r: TxRow): Transaction {
  return {
    id: r.id, kind: r.kind, status: r.status, amount: Number(r.amount), description: r.description,
    counterparty: r.counterparty ?? undefined, pixKey: r.pix_key ?? undefined,
    qrCode: r.qr_code ?? undefined, qrImage: r.qr_image ?? undefined,
    externalId: r.external_id ?? undefined, employeeId: r.employee_id ?? undefined,
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at as unknown as string).toISOString(),
    paidAt: r.paid_at ? (typeof r.paid_at === "string" ? r.paid_at : new Date(r.paid_at as unknown as string).toISOString()) : undefined,
  };
}

export const postgresStore: DataStore = {
  async getUserByEmail(email) {
    const sql = getSql();
    const rows = await sql<UserRow[]>`SELECT * FROM app_users WHERE lower(email) = lower(${email}) LIMIT 1`;
    return rows[0] ? userFromRow(rows[0]) : null;
  },
  async getUserById(id) {
    const sql = getSql();
    const rows = await sql<UserRow[]>`SELECT * FROM app_users WHERE id = ${id} LIMIT 1`;
    return rows[0] ? userFromRow(rows[0]) : null;
  },
  async listEmployees() {
    const sql = getSql();
    const rows = await sql<UserRow[]>`
      SELECT * FROM app_users
      WHERE role IN ('funcionario','cliente')
      ORDER BY created_at DESC`;
    return rows.map(userFromRow);
  },
  async createEmployee(input) {
    const sql = getSql();
    const row = {
      id: uid("u"),
      email: input.email,
      name: input.name,
      password_hash: input.passwordHash,
      role: (input.role ?? "funcionario") as UserRole,
      pix_key: input.pixKey ?? null,
      daily_amount: input.dailyAmount ?? null,
      active: input.active ?? true,
    };
    const rows = await sql<UserRow[]>`
      INSERT INTO app_users (id, email, name, password_hash, role, pix_key, daily_amount, active)
      VALUES (${row.id}, ${row.email}, ${row.name}, ${row.password_hash}, ${row.role},
              ${row.pix_key}, ${row.daily_amount}, ${row.active})
      RETURNING *`;
    return userFromRow(rows[0]);
  },
  async updateEmployee(id, patch) {
    const sql = getSql();
    const fields: Record<string, unknown> = {};
    if (patch.email !== undefined) fields.email = patch.email;
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.passwordHash !== undefined) fields.password_hash = patch.passwordHash;
    if (patch.role !== undefined) fields.role = patch.role;
    if (patch.pixKey !== undefined) fields.pix_key = patch.pixKey ?? null;
    if (patch.dailyAmount !== undefined) fields.daily_amount = patch.dailyAmount ?? null;
    if (patch.active !== undefined) fields.active = patch.active;
    if (Object.keys(fields).length === 0) return this.getUserById(id);
    const rows = await sql<UserRow[]>`UPDATE app_users SET ${sql(fields)} WHERE id = ${id} RETURNING *`;
    return rows[0] ? userFromRow(rows[0]) : null;
  },
  async deleteEmployee(id) {
    const sql = getSql();
    const rows = await sql`DELETE FROM app_users WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  },

  async listTransactions(filter) {
    const sql = getSql();
    const rows = await sql<TxRow[]>`
      SELECT * FROM app_transactions
      WHERE (${filter?.kind ?? null}::text IS NULL OR kind = ${filter?.kind ?? null})
        AND (${filter?.status ?? null}::text IS NULL OR status = ${filter?.status ?? null})
      ORDER BY created_at DESC
      LIMIT ${filter?.limit ?? 500}`;
    return rows.map(txFromRow);
  },
  async listTransactionsForEmployee(employeeId) {
    const sql = getSql();
    const rows = await sql<TxRow[]>`
      SELECT * FROM app_transactions WHERE employee_id = ${employeeId}
      ORDER BY created_at DESC`;
    return rows.map(txFromRow);
  },
  async getTransaction(id) {
    const sql = getSql();
    const rows = await sql<TxRow[]>`SELECT * FROM app_transactions WHERE id = ${id} LIMIT 1`;
    return rows[0] ? txFromRow(rows[0]) : null;
  },
  async getTransactionByExternalId(externalId) {
    const sql = getSql();
    const rows = await sql<TxRow[]>`SELECT * FROM app_transactions WHERE external_id = ${externalId} LIMIT 1`;
    return rows[0] ? txFromRow(rows[0]) : null;
  },
  async createTransaction(tx) {
    const sql = getSql();
    const rows = await sql<TxRow[]>`
      INSERT INTO app_transactions (
        id, kind, status, amount, description, counterparty, pix_key,
        qr_code, qr_image, external_id, employee_id, paid_at
      ) VALUES (
        ${uid("tx")}, ${tx.kind}, ${tx.status}, ${tx.amount}, ${tx.description},
        ${tx.counterparty ?? null}, ${tx.pixKey ?? null},
        ${tx.qrCode ?? null}, ${tx.qrImage ?? null},
        ${tx.externalId ?? null}, ${tx.employeeId ?? null},
        ${tx.paidAt ?? null}
      ) RETURNING *`;
    return txFromRow(rows[0]);
  },
  async updateTransaction(id, patch) {
    const sql = getSql();
    const fields: Record<string, unknown> = {};
    if (patch.kind !== undefined) fields.kind = patch.kind;
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.amount !== undefined) fields.amount = patch.amount;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.counterparty !== undefined) fields.counterparty = patch.counterparty ?? null;
    if (patch.pixKey !== undefined) fields.pix_key = patch.pixKey ?? null;
    if (patch.qrCode !== undefined) fields.qr_code = patch.qrCode ?? null;
    if (patch.qrImage !== undefined) fields.qr_image = patch.qrImage ?? null;
    if (patch.externalId !== undefined) fields.external_id = patch.externalId ?? null;
    if (patch.employeeId !== undefined) fields.employee_id = patch.employeeId ?? null;
    if (patch.paidAt !== undefined) fields.paid_at = patch.paidAt ?? null;
    if (Object.keys(fields).length === 0) return this.getTransaction(id);
    const rows = await sql<TxRow[]>`UPDATE app_transactions SET ${sql(fields)} WHERE id = ${id} RETURNING *`;
    return rows[0] ? txFromRow(rows[0]) : null;
  },

  async getAutoPay() {
    const sql = getSql();
    const rows = await sql<{ value: Partial<AutoPayConfig> }[]>`
      SELECT value FROM app_config WHERE key = 'autopay' LIMIT 1`;
    const v = rows[0]?.value ?? {};
    return { enabled: !!v.enabled, hour: v.hour ?? 9, minute: v.minute ?? 0, lastRunAt: v.lastRunAt };
  },
  async setAutoPay(cfg) {
    const sql = getSql();
    await sql`
      INSERT INTO app_config (key, value, updated_at)
      VALUES ('autopay', ${sql.json(cfg as unknown as postgres.JSONValue)}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    return cfg;
  },
};

export const postgresPassword = {
  hash: (pw: string) => simpleHash(pw),
  verify: verifySimple,
};
