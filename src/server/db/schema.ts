// Shared types for the data layer. Both memory and sqlite adapters implement DataStore.

export type UserRole = "admin" | "funcionario" | "cliente";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  pixKey?: string;
  dailyAmount?: number; // reais — used when role=funcionario
  active: boolean;
  createdAt: string;
}

export type TxKind = "deposito" | "saque" | "pagamento_funcionario";
export type TxStatus = "pendente" | "pago" | "expirado" | "falhou";

export interface Transaction {
  id: string;
  kind: TxKind;
  status: TxStatus;
  amount: number; // reais
  description: string;
  counterparty?: string; // pagador ou beneficiário
  pixKey?: string;
  qrCode?: string; // copia-cola
  qrImage?: string; // base64 png
  externalId?: string; // id na EvoPay
  employeeId?: string;
  createdAt: string;
  paidAt?: string;
}

export interface AutoPayConfig {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
  lastRunAt?: string;
}

export interface DataStore {
  // users
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  listEmployees(): Promise<User[]>;
  createEmployee(input: Omit<User, "id" | "createdAt" | "role"> & { role?: UserRole }): Promise<User>;
  updateEmployee(id: string, patch: Partial<User>): Promise<User | null>;
  deleteEmployee(id: string): Promise<boolean>;

  // transactions
  listTransactions(filter?: { kind?: TxKind; status?: TxStatus; limit?: number }): Promise<Transaction[]>;
  listTransactionsForEmployee(employeeId: string): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | null>;
  getTransactionByExternalId(externalId: string): Promise<Transaction | null>;
  createTransaction(tx: Omit<Transaction, "id" | "createdAt">): Promise<Transaction>;
  updateTransaction(id: string, patch: Partial<Transaction>): Promise<Transaction | null>;

  // config
  getAutoPay(): Promise<AutoPayConfig>;
  setAutoPay(cfg: AutoPayConfig): Promise<AutoPayConfig>;
}
