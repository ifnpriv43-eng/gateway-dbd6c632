import { createFileRoute } from "@tanstack/react-router";
import { handleCreateWithdrawQr } from "@/server/api-handlers.server";

export const Route = createFileRoute("/api/public/v1/withdraw/qrcode")({
  server: { handlers: { POST: async ({ request }) => handleCreateWithdrawQr(request) } },
});
