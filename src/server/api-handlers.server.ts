// Lógica compartilhada dos endpoints públicos /api/public/v1/*.
// Server-only.
import { z } from "zod";
import { db } from "@/server/db";
import {
  createPix, createPayout, createPayoutByQr, decodeQrCode,
  getPixStatus, getWithdrawStatus,
} from "@/server/evopay.server";
import { authenticateApiToken, apiError, apiJson } from "@/server/api-tokens.server";
import type { Transaction } from "@/server/db/schema";

async function auth(request: Request) {
  const token = await authenticateApiToken(request);
  if (!token) return { error: apiError(401, "unauthorized", "Bearer token inválido ou revogado") };
  return { userId: token.userId };
}

function txToPublic(t: Transaction) {
  return {
    id: t.id, kind: t.kind, status: t.status, amount: t.amount,
    description: t.description, pixKey: t.pixKey, counterparty: t.counterparty,
    externalId: t.externalId, qrCode: t.qrCode, qrImage: t.qrImage,
    createdAt: t.createdAt, paidAt: t.paidAt,
  };
}

async function saldoDe(userId: string) {
  const list = await db.listTransactionsForEmployee(userId);
  const recebidoPagamento = list
    .filter((t) => t.kind === "pagamento_funcionario" && t.status === "pago")
    .reduce((a, b) => a + b.amount, 0);
  const recebidoDeposito = list
    .filter((t) => t.kind === "deposito" && t.status === "pago")
    .reduce((a, b) => a + b.amount, 0);
  const sacado = list
    .filter((t) => t.kind === "saque" && (t.status === "pago" || t.status === "pendente"))
    .reduce((a, b) => a + b.amount, 0);
  const recebido = recebidoPagamento + recebidoDeposito;
  return { recebido, sacado, disponivel: Math.max(0, recebido - sacado) };
}

export async function handleBalance(request: Request): Promise<Response> {
  const a = await auth(request); if (a.error) return a.error;
  return apiJson(await saldoDe(a.userId!));
}

const pixSchema = z.object({
  amount: z.number().positive().max(100000),
  description: z.string().trim().min(1).max(200),
  payerName: z.string().trim().max(120).optional(),
  payerDocument: z.string().trim().max(20).optional(),
});

export async function handleCreatePix(request: Request): Promise<Response> {
  const a = await auth(request); if (a.error) return a.error;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "invalid_json", "Body inválido"); }
  const parsed = pixSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Dados inválidos");
  try {
    const pix = await createPix(parsed.data);
    const tx = await db.createTransaction({
      kind: "deposito", status: "pendente",
      amount: parsed.data.amount, description: parsed.data.description,
      counterparty: parsed.data.payerName ?? "API",
      externalId: pix.externalId, qrCode: pix.qrCode, qrImage: pix.qrImage,
      employeeId: a.userId!,
    });
    return apiJson(txToPublic(tx), 201);
  } catch (e) {
    return apiError(502, "gateway_error", (e as Error).message);
  }
}

async function findOwnedTx(userId: string, id: string): Promise<Transaction | null> {
  const tx = await db.getTransaction(id);
  if (!tx || tx.employeeId !== userId) return null;
  return tx;
}

export async function handleGetPix(request: Request, id: string): Promise<Response> {
  const a = await auth(request); if (a.error) return a.error;
  const tx = await findOwnedTx(a.userId!, id);
  if (!tx) return apiError(404, "not_found", "Transação não encontrada");
  if (tx.status === "pendente" && tx.externalId) {
    const remote = await getPixStatus(tx.externalId);
    if (remote && remote.status !== tx.status) {
      const updated = await db.updateTransaction(tx.id, {
        status: remote.status,
        paidAt: remote.status === "pago" ? (remote.paidAt ?? new Date().toISOString()) : tx.paidAt,
      });
      return apiJson(txToPublic(updated ?? tx));
    }
  }
  return apiJson(txToPublic(tx));
}

const withdrawSchema = z.object({
  amount: z.number().positive().max(100000),
  pixKey: z.string().trim().min(3).max(200),
  keyType: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
  description: z.string().trim().max(200).optional(),
});

export async function handleCreateWithdraw(request: Request): Promise<Response> {
  const a = await auth(request); if (a.error) return a.error;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "invalid_json", "Body inválido"); }
  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Dados inválidos");
  const saldo = await saldoDe(a.userId!);
  if (parsed.data.amount > saldo.disponivel) {
    return apiError(402, "insufficient_balance", `Saldo insuficiente. Disponível: ${saldo.disponivel.toFixed(2)}`);
  }
  try {
    const payout = await createPayout({
      amount: parsed.data.amount,
      pixKey: parsed.data.pixKey,
      keyType: parsed.data.keyType,
      beneficiaryName: "—",
      description: parsed.data.description,
    });
    const tx = await db.createTransaction({
      kind: "saque", status: payout.status,
      amount: parsed.data.amount,
      description: parsed.data.description ?? "Saque via API",
      pixKey: parsed.data.pixKey, counterparty: parsed.data.keyType,
      externalId: payout.externalId, employeeId: a.userId!,
      paidAt: payout.status === "pago" ? new Date().toISOString() : undefined,
    });
    return apiJson(txToPublic(tx), 201);
  } catch (e) {
    return apiError(502, "gateway_error", (e as Error).message);
  }
}

const withdrawQrSchema = z.object({
  qrCode: z.string().trim().min(20),
  amount: z.number().positive().max(100000).optional(),
  description: z.string().trim().max(200).optional(),
});

export async function handleCreateWithdrawQr(request: Request): Promise<Response> {
  const a = await auth(request); if (a.error) return a.error;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "invalid_json", "Body inválido"); }
  const parsed = withdrawQrSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Dados inválidos");
  try {
    let info: Awaited<ReturnType<typeof decodeQrCode>> | null = null;
    try { info = await decodeQrCode(parsed.data.qrCode); } catch { info = null; }
    const amount = info?.amount ?? parsed.data.amount;
    if (!amount || amount <= 0) return apiError(400, "amount_required", "Valor obrigatório para QR estático");
    const saldo = await saldoDe(a.userId!);
    if (amount > saldo.disponivel) {
      return apiError(402, "insufficient_balance", `Saldo insuficiente. Disponível: ${saldo.disponivel.toFixed(2)}`);
    }
    const payout = await createPayoutByQr({
      qrCode: parsed.data.qrCode,
      amount: info?.amount ? undefined : parsed.data.amount,
      description: parsed.data.description,
    });
    const tx = await db.createTransaction({
      kind: "saque", status: payout.status, amount,
      description: parsed.data.description ?? "Saque via QR (API)",
      pixKey: info?.name ?? "QR Code", counterparty: info?.name ?? "QR",
      externalId: payout.externalId, employeeId: a.userId!,
      paidAt: payout.status === "pago" ? new Date().toISOString() : undefined,
    });
    return apiJson(txToPublic(tx), 201);
  } catch (e) {
    return apiError(502, "gateway_error", (e as Error).message);
  }
}

export async function handleGetWithdraw(request: Request, id: string): Promise<Response> {
  const a = await auth(request); if (a.error) return a.error;
  const tx = await findOwnedTx(a.userId!, id);
  if (!tx) return apiError(404, "not_found", "Transação não encontrada");
  if (tx.status === "pendente" && tx.externalId) {
    const remote = await getWithdrawStatus(tx.externalId);
    if (remote && remote.status !== tx.status) {
      const updated = await db.updateTransaction(tx.id, {
        status: remote.status,
        paidAt: remote.status === "pago" ? (remote.paidAt ?? new Date().toISOString()) : tx.paidAt,
      });
      return apiJson(txToPublic(updated ?? tx));
    }
  }
  return apiJson(txToPublic(tx));
}

export async function handleListTransactions(request: Request): Promise<Response> {
  const a = await auth(request); if (a.error) return a.error;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50"), 1), 200);
  const list = await db.listTransactionsForEmployee(a.userId!);
  return apiJson({ data: list.slice(0, limit).map(txToPublic), total: list.length });
}
