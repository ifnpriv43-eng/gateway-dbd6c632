import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db, password as pw } from "@/server/db";
import { createPayout } from "@/server/evopay.server";
import { getSessionData } from "./session.server";

async function requireAdmin() {
  const session = await getSessionData();
  if (session.role !== "admin") throw new Error("Não autorizado");
}

export const listarFuncionarios = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const list = await db.listEmployees();
  return list.map(({ passwordHash: _p, ...rest }) => rest);
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(4).max(200),
  pixKey: z.string().trim().max(200).optional().or(z.literal("")),
  dailyAmount: z.number().nonnegative().max(100000).optional(),
  active: z.boolean().optional(),
  role: z.enum(["funcionario", "cliente"]).optional(),
});

export const criarFuncionario = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => createSchema.parse(raw))
  .handler(async ({ data }) => {
    await requireAdmin();
    const existing = await db.getUserByEmail(data.email);
    if (existing) return { ok: false as const, error: "Email já cadastrado" };
    const u = await db.createEmployee({
      name: data.name,
      email: data.email,
      passwordHash: pw.hash(data.password),
      pixKey: data.pixKey || undefined,
      dailyAmount: data.dailyAmount ?? 0,
      active: data.active ?? true,
      role: data.role ?? "funcionario",
    });
    const { passwordHash: _p, ...safe } = u;
    return { ok: true as const, employee: safe };
  });

const updateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2).max(120).optional(),
  pixKey: z.string().trim().max(200).optional().or(z.literal("")),
  dailyAmount: z.number().nonnegative().max(100000).optional(),
  active: z.boolean().optional(),
  password: z.string().min(4).max(200).optional(),
});

export const atualizarFuncionario = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => updateSchema.parse(raw))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { id, password, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (password) patch.passwordHash = pw.hash(password);
    const u = await db.updateEmployee(id, patch);
    return { ok: !!u };
  });

const idSchema = z.object({ id: z.string() });

export const excluirFuncionario = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data }) => {
    await requireAdmin();
    const ok = await db.deleteEmployee(data.id);
    return { ok };
  });

export const pagarTodos = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const { executarPagamentoDiario } = await import("@/server/autopay.server");
  return executarPagamentoDiario();
});

export const obterAutoPay = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return db.getAutoPay();
});

const autoPaySchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export const salvarAutoPay = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => autoPaySchema.parse(raw))
  .handler(async ({ data }) => {
    await requireAdmin();
    return db.setAutoPay({ ...data });
  });

const ajusteSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(["credito", "debito"]),
  amount: z.number().positive().max(1000000),
  motivo: z.string().trim().min(2).max(200),
});

// Ajuste manual de saldo: admin credita ou debita a conta do funcionário/cliente.
// Crédito → pagamento_funcionario pago (entra em "Recebido").
// Débito  → saque pago sem Pix externo (entra em "Sacado").
export const ajustarSaldoFuncionario = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ajusteSchema.parse(raw))
  .handler(async ({ data }) => {
    await requireAdmin();
    const user = await db.getUserById(data.id);
    if (!user) return { ok: false as const, error: "Usuário não encontrado" };
    if (user.role === "admin")
      return { ok: false as const, error: "Não é possível ajustar saldo do admin" };

    if (data.tipo === "debito") {
      const list = await db.listTransactionsForEmployee(user.id);
      const recebido = list
        .filter(
          (t) =>
            (t.kind === "pagamento_funcionario" || t.kind === "deposito") &&
            t.status === "pago",
        )
        .reduce((a, b) => a + b.amount, 0);
      const sacado = list
        .filter(
          (t) => t.kind === "saque" && (t.status === "pago" || t.status === "pendente"),
        )
        .reduce((a, b) => a + b.amount, 0);
      const disponivel = Math.max(0, recebido - sacado);
      if (data.amount > disponivel) {
        return {
          ok: false as const,
          error: `Débito acima do saldo disponível (R$ ${disponivel.toFixed(2)})`,
        };
      }
    }

    const now = new Date().toISOString();
    const desc = `Ajuste manual (${data.tipo === "credito" ? "crédito" : "débito"}): ${data.motivo}`;
    await db.createTransaction({
      kind: data.tipo === "credito" ? "pagamento_funcionario" : "saque",
      status: "pago",
      amount: data.amount,
      description: desc,
      counterparty: user.name,
      employeeId: user.id,
      paidAt: now,
    });
    return { ok: true as const };
  });
