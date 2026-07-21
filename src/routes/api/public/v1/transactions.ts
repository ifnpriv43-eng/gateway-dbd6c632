import { createFileRoute } from "@tanstack/react-router";
import { handleListTransactions } from "@/server/api-handlers.server";

export const Route = createFileRoute("/api/public/v1/transactions")({
  server: { handlers: { GET: async ({ request }) => handleListTransactions(request) } },
});
