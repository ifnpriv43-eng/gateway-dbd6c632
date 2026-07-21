import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { resumoDashboard } from "@/lib/transactions.functions";
import { consultarSaldo } from "@/lib/evopay.functions";
import { Card } from "@/components/ui/card";
import { ArrowDownToLine, ArrowUpFromLine, Clock, Wallet, TrendingUp, AlertCircle } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatusBadge, brl } from "@/components/tx-helpers";

export const Route = createFileRoute("/_authenticated/app/")({
  beforeLoad: ({ context }) => {
    if (context.user.role === "funcionario") {
      throw redirect({ to: "/app/meus-recebimentos" });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const resumo = useQuery({ queryKey: ["dashboard"], queryFn: () => resumoDashboard() });
  const saldo = useQuery({ queryKey: ["saldo"], queryFn: () => consultarSaldo() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do seu gateway Pix.</p>
      </div>

      {saldo.data?.mock && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 text-warning-foreground px-4 py-3 text-sm flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong className="text-warning">Modo demo:</strong> o token do gateway não está configurado.
            Estou mostrando dados de exemplo. Adicione <code>EVOPAY_TOKEN</code> no seu <code>.env</code> pra usar a API real.
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Saldo disponível" value={brl(saldo.data?.available ?? 0)} accent />
        <StatCard icon={ArrowDownToLine} label="Recebido hoje" value={brl(resumo.data?.depositosHoje ?? 0)} />
        <StatCard icon={ArrowUpFromLine} label="Sacado no mês" value={brl(resumo.data?.saquesMes ?? 0)} />
        <StatCard icon={Clock} label="Pendentes" value={String(resumo.data?.pendentes ?? 0)} />
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Receita — últimos 30 dias</h2>
            <p className="text-xs text-muted-foreground">Somente depósitos pagos</p>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={resumo.data?.chart ?? []}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.82 0.22 145)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="oklch(0.82 0.22 145)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="oklch(0.65 0.02 250)" fontSize={11} />
              <YAxis stroke="oklch(0.65 0.02 250)" fontSize={11} tickFormatter={(v) => `R$${v}`} />
              <Tooltip
                contentStyle={{ background: "oklch(0.19 0.018 250)", border: "1px solid oklch(0.28 0.02 250)", borderRadius: 8 }}
                labelStyle={{ color: "oklch(0.97 0.005 250)" }}
                formatter={(v: number) => brl(v)}
              />
              <Area type="monotone" dataKey="valor" stroke="oklch(0.82 0.22 145)" strokeWidth={2} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Transações recentes</h2>
          <Link to="/app/historico" className="text-xs text-primary hover:underline">Ver todas</Link>
        </div>
        <div className="divide-y divide-border">
          {(resumo.data?.recentes ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3 text-sm">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${t.kind === "deposito" ? "bg-success/10 text-success" : t.kind === "saque" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                  {t.kind === "deposito" ? <ArrowDownToLine className="h-4 w-4" /> : t.kind === "saque" ? <ArrowUpFromLine className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                </div>
                <div>
                  <div className="font-medium">{t.description}</div>
                  <div className="text-xs text-muted-foreground">{t.counterparty ?? "—"} · {new Date(t.createdAt).toLocaleString("pt-BR")}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={t.status} />
                <div className={`font-mono font-semibold ${t.kind === "deposito" ? "text-success" : "text-foreground"}`}>
                  {t.kind === "deposito" ? "+" : "−"}{brl(t.amount)}
                </div>
              </div>
            </div>
          ))}
          {(!resumo.data?.recentes || resumo.data.recentes.length === 0) && (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma transação ainda.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Wallet; label: string; value: string; accent?: boolean }) {
  return (
    <Card className={`p-5 ${accent ? "border-primary/30 bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className={`mt-3 text-2xl font-bold font-display ${accent ? "text-gradient" : ""}`}>{value}</div>
    </Card>
  );
}
