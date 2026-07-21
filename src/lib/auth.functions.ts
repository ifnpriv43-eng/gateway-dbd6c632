import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import { db, password as pw } from "@/server/db";
import { getSessionConfig, type SessionData } from "./session";
import { createSessionToken, getSessionData } from "./session.server";

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => loginSchema.parse(raw))
  .handler(async ({ data }) => {
    const user = await db.getUserByEmail(data.email);
    if (!user || !user.active || !pw.verify(data.password, user.passwordHash)) {
      return { ok: false as const, error: "Credenciais inválidas" };
    }
    const session = await useSession<SessionData>(getSessionConfig());
    await session.update({ userId: user.id, role: user.role });
    const sessionToken = createSessionToken({ userId: user.id, role: user.role });
    return { ok: true as const, sessionToken, user: { id: user.id, name: user.name, role: user.role, email: user.email } };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const me = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSessionData();
  if (!session.userId) return null;
  const user = await db.getUserById(session.userId);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    pixKey: user.pixKey,
    dailyAmount: user.dailyAmount,
  };
});
