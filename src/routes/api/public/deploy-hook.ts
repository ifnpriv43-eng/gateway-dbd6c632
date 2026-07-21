import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";

// Webhook do GitHub para auto-deploy na VPS.
// Configure em GitHub → Settings → Webhooks:
//   Payload URL: https://SEU_DOMINIO/api/public/deploy-hook
//   Content type: application/json
//   Secret: mesma string do env GITHUB_WEBHOOK_SECRET
//   Event: Just the push event
export const Route = createFileRoute("/api/public/deploy-hook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[deploy-hook] GITHUB_WEBHOOK_SECRET não configurado");
          return new Response("Webhook not configured", { status: 500 });
        }

        const signature = request.headers.get("x-hub-signature-256");
        const event = request.headers.get("x-github-event");
        const body = await request.text();

        if (!signature) {
          return new Response("Missing signature", { status: 401 });
        }
        const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return new Response("Invalid signature", { status: 401 });
        }

        // GitHub health check
        if (event === "ping") {
          return Response.json({ ok: true, message: "pong" });
        }
        if (event !== "push") {
          return Response.json({ ok: true, ignored: `event=${event}` });
        }

        let payload: { ref?: string; after?: string; head_commit?: { id?: string; message?: string } } = {};
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Só main
        if (payload.ref !== "refs/heads/main") {
          return Response.json({ ok: true, ignored: `ref=${payload.ref}` });
        }

        const sha = payload.after ?? payload.head_commit?.id ?? "unknown";
        console.log(`[deploy-hook] push main sha=${sha.slice(0, 7)} msg=${payload.head_commit?.message ?? ""}`);

        // Dispara o script em background e responde 202 imediatamente
        const scriptPath = process.env.DEPLOY_SCRIPT_PATH ?? "./deploy/webhook-deploy.sh";
        try {
          const child = spawn("bash", [scriptPath], {
            detached: true,
            stdio: "ignore",
            env: { ...process.env, DEPLOY_COMMIT_SHA: sha },
          });
          child.unref();
        } catch (err) {
          console.error("[deploy-hook] falha ao disparar script:", err);
          return new Response("Deploy script failed to start", { status: 500 });
        }

        return new Response(JSON.stringify({ ok: true, sha }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
