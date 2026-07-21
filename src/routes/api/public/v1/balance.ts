import { createFileRoute } from "@tanstack/react-router";
import { handleBalance } from "@/server/api-handlers.server";

export const Route = createFileRoute("/api/public/v1/balance")({
  server: { handlers: { GET: async ({ request }) => handleBalance(request) } },
});
