import { createFileRoute } from "@tanstack/react-router";
import { handleCreateWithdraw } from "@/server/api-handlers.server";

export const Route = createFileRoute("/api/public/v1/withdraw")({
  server: { handlers: { POST: async ({ request }) => handleCreateWithdraw(request) } },
});
