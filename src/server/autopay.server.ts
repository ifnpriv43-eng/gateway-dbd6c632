import { db } from "@/server/db";

export async function executarPagamentoDiario(): Promise<{
  total: number;
  results: Array<{ employeeId: string; ok: boolean; error?: string }>;
}> {
  const all = await db.listEmployees();
  const emps = all.filter((e) => e.role === "funcionario" && e.active && e.dailyAmount);
  const skipped = all.filter(
    (e) => e.role === "funcionario" && !(e.active && e.dailyAmount),
  );
  for (const s of skipped) {
    console.log(
      `[autopay] pulando ${s.name} — active=${s.active} dailyAmount=${s.dailyAmount ?? 0}`,
    );
  }
  const results: Array<{ employeeId: string; ok: boolean; error?: string }> = [];
  for (const e of emps) {
    try {
      await db.createTransaction({
        kind: "pagamento_funcionario",
        status: "pago",
        amount: e.dailyAmount ?? 0,
        description: `Diária ${e.name} (crédito automático no saldo)`,
        counterparty: e.name,
        employeeId: e.id,
        paidAt: new Date().toISOString(),
      });
      results.push({ employeeId: e.id, ok: true });
    } catch (err) {
      results.push({ employeeId: e.id, ok: false, error: (err as Error).message });
    }
  }
  const cfg = await db.getAutoPay();
  const brtDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
  await db.setAutoPay({ ...cfg, lastRunAt: `${brtDate}T00:00:00.000Z` });
  return { total: emps.length, results };
}

let started = false;

function getBrasiliaDateParts(date = new Date()) {
  // hourCycle: 'h23' garante 00..23 (evita bug do V8 que retorna "24"
  // à meia-noite quando se usa hour12:false, disparando o autopay duas vezes).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hourRaw = parseInt(get("hour"), 10);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: parseInt(get("minute"), 10),
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function startAutoPayScheduler() {
  if (started) return;
  if (typeof setInterval !== "function") return;
  started = true;
  console.log("[autopay] scheduler ativo (checa a cada 30s)");
  setInterval(async () => {
    try {
      const cfg = await db.getAutoPay();
      if (!cfg.enabled) return;
      const now = getBrasiliaDateParts();
      const today = `${now.year}-${now.month}-${now.day}`;
      if (cfg.lastRunAt && cfg.lastRunAt.slice(0, 10) === today) return;
      const currentMinutes = now.hour * 60 + now.minute;
      const scheduledMinutes = cfg.hour * 60 + cfg.minute;
      // Não perde o pagamento se o PM2 reiniciar ou o processo acordar alguns minutos depois.
      if (currentMinutes < scheduledMinutes) return;
      console.log(`[autopay] disparando pagamentos ${pad2(cfg.hour)}:${pad2(cfg.minute)} (Brasília)`);
      const r = await executarPagamentoDiario();
      console.log(`[autopay] ok=${r.results.filter((x) => x.ok).length}/${r.total}`);
    } catch (e) {
      console.error("[autopay] erro:", e);
    }
  }, 30_000);
}
