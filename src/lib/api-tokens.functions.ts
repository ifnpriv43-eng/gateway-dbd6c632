import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSessionData } from "./session.server";

async function requireSession() {
  const s = await getSessionData();
  if (!s.userId) throw new Error("Não autorizado");
  return s;
}

export const listarTokens = createServerFn({ method: "GET" }).handler(async () => {
  const s = await requireSession();
  const { listTokens } = await import("@/server/api-tokens.server");
  return listTokens(s.userId!);
});

const createSchema = z.object({ name: z.string().trim().min(1).max(60) });

export const criarToken = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => createSchema.parse(raw))
  .handler(async ({ data }) => {
    const s = await requireSession();
    const { createToken } = await import("@/server/api-tokens.server");
    return createToken(s.userId!, data.name);
  });

const idSchema = z.object({ id: z.string() });

export const revogarToken = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data }) => {
    const s = await requireSession();
    const { revokeToken } = await import("@/server/api-tokens.server");
    return { ok: await revokeToken(s.userId!, data.id) };
  });
