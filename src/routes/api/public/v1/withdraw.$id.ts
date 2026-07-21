import { createFileRoute } from "@tanstack/react-router";
import { handleGetWithdraw } from "@/server/api-handlers.server";

export const Route = createFileRoute("/api/public/v1/withdraw/$id")({
  server: { handlers: { GET: async ({ request, params }) => handleGetWithdraw(request, params.id) } },
});
