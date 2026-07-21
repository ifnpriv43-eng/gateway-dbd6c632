import { createFileRoute } from "@tanstack/react-router";
import { handleGetPix } from "@/server/api-handlers.server";

export const Route = createFileRoute("/api/public/v1/pix/$id")({
  server: { handlers: { GET: async ({ request, params }) => handleGetPix(request, params.id) } },
});
