import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { login, me } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const user = await me();
    if (user) throw redirect({ to: "/app" });
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const loginFn = useServerFn(login);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await loginFn({ data: { email, password: pw } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.localStorage.setItem("evopay-session-token", res.sessionToken);
      toast.success(`Bem-vindo, ${res.user.name}`);
      await router.invalidate();
      router.navigate({ to: "/app" });
    } catch (err) {
      toast.error((err as Error).message ?? "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden px-4">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-20 gradient-primary" />

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center overflow-hidden">
            <img src="/lynx-logo.png" alt="Lynx Wallet" className="h-9 w-9 object-contain" />
          </div>
          <span className="font-display font-bold text-xl">Lynx Wallet</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur p-8 shadow-card">
          <h1 className="text-2xl font-bold">Entrar</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesse seu painel de gateway Pix.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Senha</Label>
              <Input id="pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
