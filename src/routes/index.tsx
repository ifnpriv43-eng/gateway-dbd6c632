import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { me } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, TrendingUp, Zap } from "lucide-react";


export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await me();
    if (user) throw redirect({ to: "/app" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full blur-3xl opacity-20 gradient-primary" />

      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-black flex items-center justify-center overflow-hidden">
            <img src="/lynx-logo.png" alt="Lynx Wallet" className="h-8 w-8 object-contain" />
          </div>
          <span className="font-display font-bold text-lg">Lynx Wallet</span>
        </div>
        <Link to="/login">
          <Button variant="ghost">Entrar</Button>
        </Link>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-16 md:pt-28 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3 py-1 text-xs text-muted-foreground mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Gateway Pix — depósitos e saques em segundos
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Seu gateway Pix,<br />
          <span className="text-gradient">simples e poderoso.</span>
        </h1>

        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Gere cobranças, faça saques, acompanhe todo o fluxo financeiro e automatize
          pagamentos diários para sua equipe — tudo em um painel.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/login">
            <Button size="lg" className="gradient-primary text-primary-foreground shadow-glow">
              Acessar painel <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-24 grid md:grid-cols-3 gap-4 text-left">
          {[
            { icon: Zap, title: "Pix instantâneo", desc: "Cobranças com QR Code em 1 segundo." },
            { icon: TrendingUp, title: "Painel em tempo real", desc: "Acompanhe entradas, saídas e pendências." },
            { icon: Shield, title: "Automação de equipe", desc: "Pagamentos diários automáticos aos funcionários." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card/60 backdrop-blur p-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
