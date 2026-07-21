// EvoPay HTTP wrapper. Real API: https://api.evopay.cash/v1
// Docs: https://docs.partners.evopay.cash/llms-full.txt
import QRCode from "qrcode";

const BASE = process.env.EVOPAY_BASE_URL ?? "https://api.evopay.cash/v1";
const TOKEN = process.env.EVOPAY_TOKEN;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!TOKEN) throw new Error("EVOPAY_TOKEN not configured");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      msg = j.message ?? j.error ?? msg;
    } catch {}
    throw new Error(`EvoPay ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface CreatePixInput {
  amount: number;
  description: string;
  payerName?: string;
  payerDocument?: string;
}

export interface CreatePixResult {
  externalId: string;
  qrCode: string;
  qrImage?: string;
  expiresAt?: string;
  amount: number;
}

function makeClientReference(description: string | undefined): string {
  const base = (description?.trim() || "deposito")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "deposito";
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${base}-${unique}`.slice(0, 80);
}

interface EvoPayTransaction {
  id: string;
  amount?: number;
  qrCodeText?: string | null;
  qrCodeBase64?: string | null;
  qrCodeUrl?: string | null;
  status?: string;
  endToEndId?: string | null;
  paidAt?: string | null;
  updatedAt?: string | null;
}



function mapStatus(s: string | undefined | null): "pendente" | "pago" | "expirado" | "falhou" {
  const v = (s ?? "").toUpperCase();
  if (v === "COMPLETED" || v === "PAID" || v === "CONFIRMED") return "pago";
  if (v === "EXPIRED") return "expirado";
  if (v === "CANCELED" || v === "ERROR" || v === "FAILED" || v === "REFUSED") return "falhou";
  return "pendente";
}

export async function createPix(input: CreatePixInput): Promise<CreatePixResult> {
  if (!TOKEN) {
    const id = `mock_${Date.now().toString(36)}`;
    const qrCode = `00020126580014BR.GOV.BCB.PIX0136${id}5204000053039865802BR5913EvoPayMock6009SaoPaulo62070503***6304ABCD`;
    const qrImage = await QRCode.toDataURL(qrCode, { margin: 1, width: 320 });
    return { externalId: id, qrCode, qrImage, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), amount: input.amount };
  }
  const body: Record<string, unknown> = {
    amount: Number(input.amount.toFixed(2)),
    // EvoPay can reuse/return an existing pending charge when clientReference repeats.
    // Always send a unique reference so a new R$10 charge never receives an old R$20 QR.
    clientReference: makeClientReference(input.description),
  };
  if (input.payerName) body.generatedName = input.payerName;
  if (input.payerDocument) body.generatedDocument = input.payerDocument.replace(/\D/g, "");

  const tx = await call<EvoPayTransaction>("/pix/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const qrCode = tx.qrCodeText ?? "";
  const qrAmount = parseBrCodeAmount(qrCode);
  console.log("[evopay] createPix sent:", body.amount, "resp:", tx.amount, "qrCode amount:", qrAmount, "id:", tx.id);

  if (qrAmount !== undefined && Math.abs(qrAmount - input.amount) > 0.001) {
    throw new Error(`EvoPay gerou Pix com valor diferente: enviado R$ ${input.amount.toFixed(2)}, QR R$ ${qrAmount.toFixed(2)}`);
  }
  if (tx.amount !== undefined && Math.abs(tx.amount - input.amount) > 0.001) {
    throw new Error(`EvoPay retornou valor diferente: enviado R$ ${input.amount.toFixed(2)}, retorno R$ ${tx.amount.toFixed(2)}`);
  }

  let qrImage: string | undefined;
  if (tx.qrCodeBase64) {
    qrImage = tx.qrCodeBase64.startsWith("data:") ? tx.qrCodeBase64 : `data:image/png;base64,${tx.qrCodeBase64}`;
  } else if (qrCode) {
    // Regenerate PNG from qrCodeText to guarantee it matches the string we display
    qrImage = await QRCode.toDataURL(qrCode, { margin: 1, width: 320 });
  }
  return { externalId: tx.id, qrCode, qrImage, amount: input.amount };
}

// Parses a Pix BR Code (EMV) string and returns the amount from tag 54, if present.
function parseBrCodeAmount(brcode: string): number | undefined {
  if (!brcode) return undefined;
  let i = 0;
  while (i < brcode.length - 4) {
    const tag = brcode.slice(i, i + 2);
    const len = parseInt(brcode.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len)) return undefined;
    const value = brcode.slice(i + 4, i + 4 + len);
    if (tag === "54") {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : undefined;
    }
    i += 4 + len;
  }
  return undefined;
}

type UiKeyType = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
type ApiPixType = "cpf" | "cnpj" | "email" | "phone" | "evp";

function mapKeyType(t: UiKeyType | undefined, key: string): ApiPixType {
  if (t === "telefone") return "phone";
  if (t === "aleatoria") return "evp";
  if (t === "cpf" || t === "cnpj" || t === "email") return t;
  const k = key.trim();
  if (/^\S+@\S+\.\S+$/.test(k)) return "email";
  const digits = k.replace(/\D/g, "");
  if (digits.length === 11 && !k.startsWith("+")) return "cpf";
  if (digits.length === 14) return "cnpj";
  if (k.startsWith("+") || digits.length >= 10) return "phone";
  return "evp";
}

export interface PayoutInput {
  amount: number;
  pixKey: string;
  keyType?: UiKeyType;
  beneficiaryName?: string;
  description?: string;
}
export interface PayoutResult {
  externalId: string;
  status: "pendente" | "pago" | "falhou";
}

export async function createPayout(input: PayoutInput): Promise<PayoutResult> {
  if (!TOKEN) {
    return { externalId: `mock_out_${Date.now().toString(36)}`, status: "pago" };
  }
  const pixType = mapKeyType(input.keyType, input.pixKey);
  const pixKey =
    pixType === "cpf" || pixType === "cnpj"
      ? input.pixKey.replace(/\D/g, "")
      : input.pixKey.trim();
  const tx = await call<EvoPayTransaction>("/withdraw/", {
    method: "POST",
    body: JSON.stringify({
      amount: Number(input.amount.toFixed(2)),
      pixKey,
      pixType,
      description: input.description,
    }),
  });
  const s = mapStatus(tx.status);
  return { externalId: tx.id, status: s === "expirado" ? "falhou" : s };
}

export interface QrDecoded {
  qrCodeType: "DYNAMIC" | "STATIC";
  amount?: number;
  name?: string;
  document?: string;
  additionalInfo?: string;
  expiresIn?: string;
  txid?: string;
}

export async function decodeQrCode(qrCode: string): Promise<QrDecoded> {
  if (!TOKEN) {
    return { qrCodeType: "STATIC", amount: 10, name: "Mock Merchant" };
  }
  const res = await call<QrDecoded>("/pix/qr-code/read", {
    method: "POST",
    body: JSON.stringify({ qrCode }),
  });
  return res;
}

export interface PayoutQrInput {
  qrCode: string;
  amount?: number;
  description?: string;
}

export async function createPayoutByQr(input: PayoutQrInput): Promise<PayoutResult & { info?: QrDecoded }> {
  if (!TOKEN) {
    return { externalId: `mock_out_${Date.now().toString(36)}`, status: "pago" };
  }
  const body: Record<string, unknown> = { qrCode: input.qrCode };
  if (input.amount) body.amount = Number(input.amount.toFixed(2));
  if (input.description) body.description = input.description;
  const tx = await call<EvoPayTransaction>("/withdraw/qrcode", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const s = mapStatus(tx.status);
  return { externalId: tx.id, status: s === "expirado" ? "falhou" : s };
}

export interface RemoteStatus {
  status: "pendente" | "pago" | "expirado" | "falhou";
  endToEndId?: string;
  paidAt?: string;
}

export async function getPixStatus(externalId: string): Promise<RemoteStatus | null> {
  if (!TOKEN) return null;
  try {
    const tx = await call<EvoPayTransaction>(`/pix/?id=${encodeURIComponent(externalId)}`);
    return {
      status: mapStatus(tx.status),
      endToEndId: tx.endToEndId ?? undefined,
      paidAt: tx.paidAt ?? tx.updatedAt ?? undefined,
    };
  } catch (err) {
    console.error("[evopay] getPixStatus failed:", err);
    return null;
  }
}

export async function getWithdrawStatus(externalId: string): Promise<RemoteStatus | null> {
  if (!TOKEN) return null;
  try {
    const tx = await call<EvoPayTransaction>(`/withdraw/?id=${encodeURIComponent(externalId)}`);
    return {
      status: mapStatus(tx.status),
      endToEndId: tx.endToEndId ?? undefined,
      paidAt: tx.paidAt ?? tx.updatedAt ?? undefined,
    };
  } catch (err) {
    console.error("[evopay] getWithdrawStatus failed:", err);
    return null;
  }
}

export async function getBalance(): Promise<{ available: number; pending: number }> {
  if (!TOKEN) {
    return { available: 12480.55, pending: 1300 };
  }
  try {
    const res = await call<{ balanceAvailable: number; balanceBlocked: number }>("/user/balance");
    return { available: res.balanceAvailable ?? 0, pending: res.balanceBlocked ?? 0 };
  } catch (err) {
    console.error("[evopay] getBalance failed:", err);
    return { available: 0, pending: 0 };
  }
}

export const isMock = !TOKEN;
