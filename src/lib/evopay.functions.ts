import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/server/db";
import {
  createPix,
  createPayout,
  createPayoutByQr,
  decodeQrCode,
  getBalance,
  getPixStatus,
  getWithdrawStatus,
  isMock,
} from "@/server/evopay.server";
import { getSessionData } from "./session.server";

async function requireAdmin() {
  const session = await getSessionData();
  if (!session.userId || session.role !== "admin") {
    throw new Error("Não autorizado");
  }
  return session;
}

async function requireSession() {
  const session = await getSessionData();
  if (!session.userId) throw new Error("Não autorizado");
  return session;
}

const criarPixSchema = z.object({
  amount: z.number().positive().max(100000),
  description: z.string().trim().min(1).max(200),
  payerName: z.string().trim().max(120).optional(),
  payerDocument: z.string().trim().max(20).optional(),
});

export const criarDeposito = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => criarPixSchema.parse(raw))
  .handler(async ({ data }) => {
    const s = await requireSession();
    const pix = await createPix(data);
    if (Math.abs(pix.amount - data.amount) > 0.001) {
      console.warn(`[deposito] EvoPay retornou valor diferente. Enviado=${data.amount} recebido=${pix.amount}`);
    }
    const tx = await db.createTransaction({
      kind: "deposito",
      status: "pendente",
      amount: pix.amount,
      description: data.description,
      counterparty: data.payerName ?? "—",
      externalId: pix.externalId,
      qrCode: pix.qrCode,
      qrImage: pix.qrImage,
      employeeId: s.role === "admin" ? undefined : s.userId!,
    });
    return { tx, qrCode: pix.qrCode, qrImage: pix.qrImage, amount: pix.amount };
  });

const sacarSchema = z.object({
  amount: z.number().positive().max(100000),
  pixKey: z.string().trim().min(3).max(200),
  keyType: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional(),
  beneficiaryName: z.string().trim().max(120).optional(),
  description: z.string().trim().max(200).optional(),
});

async function assertSaldoParaSaque(userId: string, amount: number) {
  const list = await db.listTransactionsForEmployee(userId);
  const recebido = list
    .filter((t) => (t.kind === "pagamento_funcionario" || t.kind === "deposito") && t.status === "pago")
    .reduce((a, b) => a + b.amount, 0);
  const sacado = list
    .filter((t) => t.kind === "saque" && (t.status === "pago" || t.status === "pendente"))
    .reduce((a, b) => a + b.amount, 0);
  const disponivel = recebido - sacado;
  if (amount > disponivel) {
    throw new Error(`Saldo insuficiente. Disponível: R$ ${disponivel.toFixed(2)}`);
  }
}

export const criarSaque = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => sacarSchema.parse(raw))
  .handler(async ({ data }) => {
    const s = await requireSession();
    if (s.role !== "admin") await assertSaldoParaSaque(s.userId!, data.amount);
    const payout = await createPayout({
      amount: data.amount,
      pixKey: data.pixKey,
      keyType: data.keyType,
      beneficiaryName: data.beneficiaryName ?? "—",
      description: data.description,
    });
    const tx = await db.createTransaction({
      kind: "saque",
      status: payout.status,
      amount: data.amount,
      description: data.description ?? "Saque",
      pixKey: data.pixKey,
      counterparty: data.keyType ?? data.beneficiaryName ?? "—",
      externalId: payout.externalId,
      employeeId: s.role === "admin" ? undefined : s.userId!,
      paidAt: payout.status === "pago" ? new Date().toISOString() : undefined,
    });
    return { tx };
  });

const qrDecodeSchema = z.object({ qrCode: z.string().trim().min(20) });

export const decodificarQr = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => qrDecodeSchema.parse(raw))
  .handler(async ({ data }) => {
    await requireSession();
    return decodeQrCode(data.qrCode);
  });

const saqueQrSchema = z.object({
  qrCode: z.string().trim().min(20),
  amount: z.number().positive().max(100000).optional(),
  description: z.string().trim().max(200).optional(),
});

export const criarSaqueQr = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => saqueQrSchema.parse(raw))
  .handler(async ({ data }) => {
    const s = await requireSession();
    let info: Awaited<ReturnType<typeof decodeQrCode>> | null = null;
    try {
      info = await decodeQrCode(data.qrCode);
    } catch {
      info = null;
    }
    const amount = info?.amount ?? data.amount;
    if (!amount || amount <= 0) throw new Error("Valor obrigatório para QR estático");
    if (s.role !== "admin") await assertSaldoParaSaque(s.userId!, amount);
    const payout = await createPayoutByQr({
      qrCode: data.qrCode,
      amount: info?.amount ? undefined : data.amount,
      description: data.description,
    });
    const tx = await db.createTransaction({
      kind: "saque",
      status: payout.status,
      amount,
      description: data.description ?? "Saque via QR",
      pixKey: info?.name ?? "QR Code",
      counterparty: info?.name ?? "QR",
      externalId: payout.externalId,
      employeeId: s.role === "admin" ? undefined : s.userId!,
      paidAt: payout.status === "pago" ? new Date().toISOString() : undefined,
    });
    return { tx, info };
  });



export const consultarSaldo = createServerFn({ method: "GET" }).handler(async () => {
  // Saldo do gateway é sensível — só admin
  await requireAdmin();
  return { ...(await getBalance()), mock: isMock };
});

export const meuSaldoFuncionario = createServerFn({ method: "GET" }).handler(async () => {
  const s = await requireSession();
  const user = await db.getUserById(s.userId!);
  const rawList = await db.listTransactionsForEmployee(s.userId!);
  const synced = await Promise.all(
    rawList.map(async (t) => {
      if (t.status !== "pendente" || !t.externalId || (t.kind !== "saque" && t.kind !== "pagamento_funcionario")) return t;
      const remote = await getWithdrawStatus(t.externalId);
      if (!remote || remote.status === t.status) return t;
      return (
        (await db.updateTransaction(t.id, {
          status: remote.status,
          paidAt: remote.status === "pago" ? remote.paidAt ?? new Date().toISOString() : t.paidAt,
        })) ?? t
      );
    }),
  );
  const list = synced;
  const hojeBrasilia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const temDiariaHoje = list.some(
    (t) =>
      t.kind === "pagamento_funcionario" &&
      (t.status === "pago" || t.status === "pendente") &&
      (t.paidAt ?? t.createdAt).slice(0, 10) === hojeBrasilia,
  );
  const cfg = await db.getAutoPay();
  const diariaAReceber =
    user?.role === "funcionario" && user.active && !temDiariaHoje ? Math.max(0, user.dailyAmount ?? 0) : 0;
  const diariaAmanha =
    user?.role === "funcionario" && user.active && temDiariaHoje ? Math.max(0, user.dailyAmount ?? 0) : 0;
  const recebido = list
    .filter((t) => (t.kind === "pagamento_funcionario" || t.kind === "deposito") && t.status === "pago")
    .reduce((a, b) => a + b.amount, 0);
  const pendente = list
    .filter((t) => (t.kind === "pagamento_funcionario" || t.kind === "deposito") && t.status === "pendente")
    .reduce((a, b) => a + b.amount, 0);
  const sacado = list
    .filter((t) => t.kind === "saque" && (t.status === "pago" || t.status === "pendente"))
    .reduce((a, b) => a + b.amount, 0);
  return {
    recebido,
    pendente: pendente + diariaAReceber + diariaAmanha,
    sacado,
    disponivel: Math.max(0, recebido - sacado),
    diariaAReceber,
    diariaAmanha,
    autoPay: { enabled: cfg.enabled, hour: cfg.hour, minute: cfg.minute },
    jaPagoHoje: temDiariaHoje,
    hasPixKey: !!user?.pixKey,
  };
});

const meuSaqueSchema = z.object({
  amount: z.number().positive().max(100000),
  pixKey: z.string().trim().min(3).max(200),
  keyType: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
  description: z.string().trim().max(200).optional(),
});

export const sacarMeuSaldo = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => meuSaqueSchema.parse(raw))
  .handler(async ({ data }) => {
    const s = await requireSession();
    // Verifica saldo disponível
    const list = await db.listTransactionsForEmployee(s.userId!);
    const recebido = list
      .filter((t) => (t.kind === "pagamento_funcionario" || t.kind === "deposito") && t.status === "pago")
      .reduce((a, b) => a + b.amount, 0);
    const sacado = list
      .filter((t) => t.kind === "saque" && (t.status === "pago" || t.status === "pendente"))
      .reduce((a, b) => a + b.amount, 0);
    const disponivel = recebido - sacado;
    if (data.amount > disponivel) {
      throw new Error(`Saldo insuficiente. Disponível: R$ ${disponivel.toFixed(2)}`);
    }
    const payout = await createPayout({
      amount: data.amount,
      pixKey: data.pixKey,
      keyType: data.keyType,
      beneficiaryName: "—",
      description: data.description,
    });
    const tx = await db.createTransaction({
      kind: "saque",
      status: payout.status,
      amount: data.amount,
      description: data.description ?? "Saque do saldo",
      pixKey: data.pixKey,
      counterparty: data.keyType,
      externalId: payout.externalId,
      employeeId: s.userId!,
      paidAt: payout.status === "pago" ? new Date().toISOString() : undefined,
    });
    return { tx };
  });

const idSchema = z.object({ id: z.string() });

export const atualizarStatusTransacao = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data }) => {
    await requireSession();
    const tx = await db.getTransaction(data.id);
    if (!tx || !tx.externalId) return { ok: false, tx };
    const remote =
      tx.kind === "deposito"
        ? await getPixStatus(tx.externalId)
        : tx.kind === "saque"
        ? await getWithdrawStatus(tx.externalId)
        : null;
    if (!remote) return { ok: false, tx };
    if (remote.status !== tx.status) {
      const updated = await db.updateTransaction(tx.id, {
        status: remote.status,
        paidAt: remote.status === "pago" ? remote.paidAt ?? new Date().toISOString() : tx.paidAt,
      });
      return { ok: true, tx: updated };
    }
    return { ok: true, tx };
  });

// Simulate payment of a pending deposit — preview convenience.
export const simularPagamento = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data }) => {
    await requireAdmin();
    const tx = await db.getTransaction(data.id);
    if (!tx || tx.kind !== "deposito" || tx.status !== "pendente") return { ok: false };
    await db.updateTransaction(tx.id, { status: "pago", paidAt: new Date().toISOString() });
    return { ok: true };
  });
