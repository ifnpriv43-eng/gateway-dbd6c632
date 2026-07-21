// Webhook público da EvoPay — atualiza status de cobranças.
// Configure na EvoPay: https://seudominio.com/api/public/evopay/webhook
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/server/db";

export const Route = createFileRoute("/api/public/evopay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // TODO: validar assinatura HMAC quando a EvoPay documentar o header.
        let body: unknown;
        try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
        const b = body as { id?: string; event?: string; status?: string };
        if (!b?.id) return new Response("Missing id", { status: 400 });

        const tx = await db.getTransactionByExternalId(b.id);
        if (!tx) return new Response("ok", { status: 200 });

        const map: Record<string, "pago" | "pendente" | "expirado" | "falhou"> = {
          paid: "pago", confirmed: "pago", pending: "pendente",
          expired: "expirado", failed: "falhou", refused: "falhou",
        };
        const newStatus = map[b.status ?? ""] ?? tx.status;
        await db.updateTransaction(tx.id, {
          status: newStatus,
          paidAt: newStatus === "pago" ? new Date().toISOString() : tx.paidAt,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
