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
