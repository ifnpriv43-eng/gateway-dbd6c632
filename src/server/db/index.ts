// Data store selector.
// - Padrão → adapter Postgres self-hosted (VPS).
// - DATA_DRIVER=memory → ephemeral in-memory store (tests / offline).
//
// O fallback antigo de Supabase foi removido de propósito: esta aplicação usa
// Postgres na VPS e não deve tentar inicializar Lovable Cloud/Supabase no build.

import { memoryStore, memoryPassword } from "./memory";
import type { DataStore } from "./schema";

const driver = process.env.DATA_DRIVER === "memory" ? "memory" : "postgres";

async function resolve(): Promise<{ store: DataStore; password: typeof memoryPassword }> {
  if (driver === "memory") return { store: memoryStore, password: memoryPassword };
  if (driver === "postgres") {
    const mod = await import("./postgres.server");
    return { store: mod.postgresStore, password: mod.postgresPassword };
  }
  throw new Error(`DATA_DRIVER inválido: ${driver}`);
}

// Proxy: cada método resolve o adapter real na hora da chamada.
export const db: DataStore = new Proxy({} as DataStore, {
  get(_t, prop: string) {
    return async (...args: unknown[]) => {
      const { store } = await resolve();
      // deno-lint-ignore no-explicit-any
      return (store as any)[prop](...args);
    };
  },
}) as DataStore;

export const password = {
  hash: (pw: string) => memoryPassword.hash(pw),
  verify: (pw: string, hash: string) => memoryPassword.verify(pw, hash),
};

export { driver };
