// In-memory data store — used in the Lovable preview (Cloudflare Workers)
// where filesystem persistence isn't available. All data resets on restart.

import type { AutoPayConfig, DataStore, Transaction, User, UserRole } from "./schema";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// Simple non-crypto hash so the memory adapter can validate seeded creds
// without pulling bcrypt into the Worker bundle. In VPS we use bcryptjs.
function simpleHash(pw: string) {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h) ^ pw.charCodeAt(i);
  return `sh1$${(h >>> 0).toString(16)}$${pw.length}`;
}

function verifySimple(pw: string, hash: string) {
  return simpleHash(pw) === hash;
}

interface State {
  users: User[];
  txs: Transaction[];
  autoPay: AutoPayConfig;
  seeded: boolean;
}

const state: State = {
  users: [],
  txs: [],
  autoPay: { enabled: false, hour: 9, minute: 0 },
  seeded: false,
};

function seed() {
  if (state.seeded) return;
  state.seeded = true;

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@evopay.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  state.users.push({
    id: "u_admin",
    email: adminEmail,
    name: "Administrador",
    passwordHash: simpleHash(adminPassword),
    role: "admin",
    active: true,
    createdAt: new Date().toISOString(),
  });

  state.users.push({
    id: "u_maria",
    email: "maria@evopay.local",
    name: "Maria Silva",
    passwordHash: simpleHash("maria123"),
    role: "funcionario",
    pixKey: "maria@evopay.local",
    dailyAmount: 50,
    active: true,
    createdAt: new Date().toISOString(),
  });

  state.users.push({
    id: "u_joao",
    email: "joao@evopay.local",
    name: "João Santos",
    passwordHash: simpleHash("joao123"),
    role: "funcionario",
    pixKey: "11999998888",
    dailyAmount: 30,
    active: true,
    createdAt: new Date().toISOString(),
  });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const samples: Array<Partial<Transaction> & Pick<Transaction, "kind" | "status" | "amount" | "description">> = [
    { kind: "deposito", status: "pago", amount: 250, description: "Cobrança Pix #1042", counterparty: "Carlos M." },
    { kind: "deposito", status: "pago", amount: 89.9, description: "Cobrança Pix #1041", counterparty: "Ana P." },
    { kind: "deposito", status: "pendente", amount: 500, description: "Cobrança Pix #1040", counterparty: "—" },
    { kind: "saque", status: "pago", amount: 300, description: "Saque para conta principal", pixKey: "meu@banco.com" },
    { kind: "pagamento_funcionario", status: "pago", amount: 50, description: "Diária Maria Silva", employeeId: "u_maria", pixKey: "maria@evopay.local", counterparty: "Maria Silva" },
    { kind: "pagamento_funcionario", status: "pago", amount: 30, description: "Diária João Santos", employeeId: "u_joao", pixKey: "11999998888", counterparty: "João Santos" },
    { kind: "deposito", status: "pago", amount: 1200, description: "Cobrança Pix #1039", counterparty: "Empresa XYZ" },
    { kind: "saque", status: "pendente", amount: 800, description: "Saque agendado", pixKey: "meu@banco.com" },
  ];
  samples.forEach((s, i) => {
    state.txs.push({
      id: uid("tx"),
      createdAt: new Date(now - (i + 1) * (day / 3)).toISOString(),
      paidAt: s.status === "pago" ? new Date(now - (i + 1) * (day / 3) + 60000).toISOString() : undefined,
      ...s,
    } as Transaction);
  });
}

seed();

export const memoryStore: DataStore = {
  async getUserByEmail(email) {
    seed();
    const u = state.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return u ?? null;
  },
  async getUserById(id) {
    return state.users.find((x) => x.id === id) ?? null;
  },
  async listEmployees() {
    return state.users.filter((u) => u.role === "funcionario");
  },
  async createEmployee(input) {
    const user: User = {
      id: uid("u"),
      createdAt: new Date().toISOString(),
      role: (input.role ?? "funcionario") as UserRole,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      pixKey: input.pixKey,
      dailyAmount: input.dailyAmount,
      active: input.active ?? true,
    };
    state.users.push(user);
    return user;
  },
  async updateEmployee(id, patch) {
    const idx = state.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    state.users[idx] = { ...state.users[idx], ...patch };
    return state.users[idx];
  },
  async deleteEmployee(id) {
    const before = state.users.length;
    state.users = state.users.filter((u) => u.id !== id);
    return state.users.length < before;
  },

  async listTransactions(filter) {
    let list = [...state.txs];
    if (filter?.kind) list = list.filter((t) => t.kind === filter.kind);
    if (filter?.status) list = list.filter((t) => t.status === filter.status);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  },
  async listTransactionsForEmployee(employeeId) {
    return state.txs
      .filter((t) => t.employeeId === employeeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getTransaction(id) {
    return state.txs.find((t) => t.id === id) ?? null;
  },
  async getTransactionByExternalId(externalId) {
    return state.txs.find((t) => t.externalId === externalId) ?? null;
  },
  async createTransaction(tx) {
    const created: Transaction = {
      id: uid("tx"),
      createdAt: new Date().toISOString(),
      ...tx,
    };
    state.txs.push(created);
    return created;
  },
  async updateTransaction(id, patch) {
    const idx = state.txs.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    state.txs[idx] = { ...state.txs[idx], ...patch };
    return state.txs[idx];
  },

  async getAutoPay() {
    return state.autoPay;
  },
  async setAutoPay(cfg) {
    state.autoPay = { ...state.autoPay, ...cfg };
    return state.autoPay;
  },
};

// Password helpers exposed for the memory adapter.
export const memoryPassword = {
  hash: (pw: string) => simpleHash(pw),
  verify: verifySimple,
};
