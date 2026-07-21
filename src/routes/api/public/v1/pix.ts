import { createFileRoute } from "@tanstack/react-router";
import { handleCreatePix } from "@/server/api-handlers.server";

export const Route = createFileRoute("/api/public/v1/pix")({
  server: { handlers: { POST: async ({ request }) => handleCreatePix(request) } },
});
