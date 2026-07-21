// Parser leve do BR Code (EMV Pix). Extrai chave, valor e info do merchant.
// Não valida CRC — apenas parseia os TLVs.

interface EmvNode {
  id: string;
  value: string;
  children?: Record<string, EmvNode>;
}

function parseTLV(s: string): Record<string, EmvNode> {
  const out: Record<string, EmvNode> = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (isNaN(len)) break;
    const value = s.slice(i + 4, i + 4 + len);
    out[id] = { id, value };
    i += 4 + len;
  }
  return out;
}

export type PixKeyType = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

export interface PixEmvData {
  pixKey?: string;
  keyType?: PixKeyType;
  amount?: number;
  merchantName?: string;
  merchantCity?: string;
  description?: string;
  raw: string;
}

function detectKeyType(key: string): PixKeyType {
  const k = key.trim();
  if (/^\S+@\S+\.\S+$/.test(k)) return "email";
  const digits = k.replace(/\D/g, "");
  if (digits.length === 11 && !k.startsWith("+")) return "cpf";
  if (digits.length === 14) return "cnpj";
  if (k.startsWith("+") || (digits.length >= 10 && digits.length <= 13)) return "telefone";
  return "aleatoria";
}

export function parsePixBrCode(input: string): PixEmvData | null {
  const s = input.trim();
  if (!s || s.length < 20) return null;
  try {
    const root = parseTLV(s);
    // 26..51 são "Merchant Account Information" — a chave Pix costuma estar em 26
    let pixKey: string | undefined;
    for (let n = 26; n <= 51; n++) {
      const id = String(n).padStart(2, "0");
      const node = root[id];
      if (!node) continue;
      const sub = parseTLV(node.value);
      // subcampo 01 = chave; 02 = infoAdicional
      if (sub["01"]?.value) {
        pixKey = sub["01"].value.trim();
        break;
      }
    }
    const amountStr = root["54"]?.value;
    const amount = amountStr ? parseFloat(amountStr) : undefined;
    const merchantName = root["59"]?.value;
    const merchantCity = root["60"]?.value;

    // additional data field 62 → subcampo 05 = referência
    let description: string | undefined;
    if (root["62"]?.value) {
      const add = parseTLV(root["62"].value);
      description = add["05"]?.value;
    }

    if (!pixKey && !amount) return null;
    return {
      pixKey,
      keyType: pixKey ? detectKeyType(pixKey) : undefined,
      amount: amount && !isNaN(amount) ? amount : undefined,
      merchantName,
      merchantCity,
      description,
      raw: s,
    };
  } catch {
    return null;
  }
}
