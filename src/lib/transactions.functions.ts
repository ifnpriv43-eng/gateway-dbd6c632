import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/server/db";
import { getSessionData } from "./session.server";
import { getPixStatus, getWithdrawStatus } from "@/server/evopay.server";
import type { Transaction, TxKind, TxStatus } from "@/server/db/schema";

async function syncPending(rows: Transaction[]): Promise<Transaction[]> {
  const pend = rows.filter(
    (t) => t.status === "pendente" && t.externalId && (t.kind === "deposito" || t.kind === "saque" || t.kind === "pagamento_funcionario"),
  );
  if (!pend.length) return rows;
  const updates = await Promise.all(pend.map(async (t) => {
    try {
      const remote = t.kind === "deposito" ? await getPixStatus(t.externalId!) : await getWithdrawStatus(t.externalId!);
      if (!remote || remote.status === t.status) return null;
      return db.updateTransaction(t.id, {
        status: remote.status,
        paidAt: remote.status === "pago" ? (remote.paidAt ?? new Date().toISOString()) : t.paidAt,
      });
    } catch { return null; }
  }));
  const map = new Map<string, Transaction>();
  for (const u of updates) if (u) map.set(u.id, u);
  return rows.map((r) => map.get(r.id) ?? r);
}

async function requireSession() {
  const session = await getSessionData();
  if (!session.userId) throw new Error("Não autorizado");
  return session;
}

const filterSchema = z.object({
  kind: z.enum(["deposito", "saque", "pagamento_funcionario"]).optional(),
  status: z.enum(["pendente", "pago", "expirado", "falhou"]).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const listarTransacoes = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => filterSchema.parse(raw ?? {}))
  .handler(async ({ data }) => {
    const s = await requireSession();
    const rows = s.role === "admin"
      ? await db.listTransactions(data as { kind?: TxKind; status?: TxStatus; limit?: number })
      : await db.listTransactionsForEmployee(s.userId!);
    return syncPending(rows);
  });

export const resumoDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const s = await requireSession();
  const all =
    s.role === "admin"
      ? await db.listTransactions()
      : await db.listTransactionsForEmployee(s.userId!);

  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = new Date().toISOString().slice(0, 7);

  const depositosHoje = all
    .filter((t) => t.kind === "deposito" && t.status === "pago" && (t.paidAt ?? "").startsWith(today))
    .reduce((a, b) => a + b.amount, 0);

  const saquesMes = all
    .filter((t) => t.kind === "saque" && t.status === "pago" && (t.paidAt ?? "").startsWith(monthPrefix))
    .reduce((a, b) => a + b.amount, 0);

  const pendentes = all.filter((t) => t.status === "pendente").length;

  // last 30 days by day
  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    byDay.set(d, 0);
  }
  for (const t of all) {
    if (t.kind === "deposito" && t.status === "pago" && t.paidAt) {
      const day = t.paidAt.slice(0, 10);
      if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + t.amount);
    }
  }
  const chart = Array.from(byDay.entries()).map(([date, valor]) => ({ date, valor }));

  return {
    depositosHoje,
    saquesMes,
    pendentes,
    recentes: all.slice(0, 10),
    chart,
  };
});
