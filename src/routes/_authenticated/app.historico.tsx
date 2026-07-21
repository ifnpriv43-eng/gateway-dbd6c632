import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { listarTransacoes } from "@/lib/transactions.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, brl, kindLabel } from "@/components/tx-helpers";
import { TransactionDetailDialog } from "@/components/transaction-detail-dialog";
import { Eye } from "lucide-react";
import type { Transaction, TxKind, TxStatus } from "@/server/db/schema";

export const Route = createFileRoute("/_authenticated/app/historico")({
  component: HistoricoPage,
});

function HistoricoPage() {
  const [kind, setKind] = useState<TxKind | "todos">("todos");
  const [status, setStatus] = useState<TxStatus | "todos">("todos");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Transaction | null>(null);

  const list = useQuery({
    queryKey: ["txs", "all", kind, status],
    queryFn: () => listarTransacoes({
      data: {
        kind: kind === "todos" ? undefined : kind,
        status: status === "todos" ? undefined : status,
        limit: 5,
      },
    }),
  });

  const filtered = useMemo(() => {
    const src = list.data ?? [];
    if (!q) return src;
    const l = q.toLowerCase();
    return src.filter((t) =>
      t.description.toLowerCase().includes(l) ||
      (t.counterparty ?? "").toLowerCase().includes(l) ||
      (t.pixKey ?? "").toLowerCase().includes(l) ||
      String(t.amount).includes(l)
    );
  }, [list.data, q]);

  function exportCSV() {
    const rows = [
      ["Data", "Tipo", "Descrição", "Contraparte", "Chave Pix", "Status", "Valor"],
      ...filtered.map((t) => [
        new Date(t.createdAt).toLocaleString("pt-BR"),
        kindLabel[t.kind],
        t.description,
        t.counterparty ?? "",
        t.pixKey ?? "",
        t.status,
        t.amount.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Histórico</h1>
          <p className="text-muted-foreground text-sm mt-1">Todas as movimentações do seu gateway.</p>
        </div>
        <button onClick={exportCSV} className="text-sm text-primary hover:underline">Exportar CSV</button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Buscar por descrição, nome, valor…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={kind} onValueChange={(v) => setKind(v as TxKind | "todos")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="deposito">Depósitos</SelectItem>
              <SelectItem value="saque">Saques</SelectItem>
              <SelectItem value="pagamento_funcionario">Pagamentos equipe</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as TxStatus | "todos")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="expirado">Expirado</SelectItem>
              <SelectItem value="falhou">Falhou</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="w-full overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left py-3 px-4 font-medium">Data</th>
              <th className="text-left py-3 px-4 font-medium">Tipo</th>
              <th className="text-left py-3 px-4 font-medium">Descrição</th>
              <th className="text-left py-3 px-4 font-medium">Contraparte</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-right py-3 px-4 font-medium">Valor</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-muted/20">
                <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{new Date(t.createdAt).toLocaleString("pt-BR")}</td>
                <td className="py-3 px-4">{kindLabel[t.kind]}</td>
                <td className="py-3 px-4 font-medium">{t.description}</td>
                <td className="py-3 px-4 text-muted-foreground">{t.counterparty ?? "—"}</td>
                <td className="py-3 px-4"><StatusBadge status={t.status} /></td>
                <td className={`py-3 px-4 text-right font-mono font-semibold ${t.kind === "deposito" ? "text-success" : ""}`}>
                  {t.kind === "deposito" ? "+" : "−"}{brl(t.amount)}
                </td>
                <td className="py-3 px-4 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setDetail(t)}>
                    <Eye className="h-4 w-4 mr-1" /> Ver
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-12">Nada por aqui ainda.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      <TransactionDetailDialog tx={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}
