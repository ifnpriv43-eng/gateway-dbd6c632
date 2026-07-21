import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { criarDeposito, simularPagamento } from "@/lib/evopay.functions";
import { listarTransacoes } from "@/lib/transactions.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge, brl } from "@/components/tx-helpers";
import { TransactionDetailDialog } from "@/components/transaction-detail-dialog";
import { Copy, Loader2, Plus, CheckCircle2, Eye, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/server/db/schema";

export const Route = createFileRoute("/_authenticated/app/depositos")({
  component: DepositosPage,
});

function DepositosPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [payer, setPayer] = useState("");
  const [qr, setQr] = useState<{ txId: string; qrCode: string; qrImage?: string; amount: number } | null>(null);
  const [paid, setPaid] = useState(false);
  const [detail, setDetail] = useState<Transaction | null>(null);

  const list = useQuery({
    queryKey: ["txs", "deposito"],
    queryFn: () => listarTransacoes({ data: { kind: "deposito", limit: 5 } }),
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === "pendente") ? 8000 : false),
  });

  const create = useMutation({
    mutationFn: () => criarDeposito({ data: { amount: parseFloat(amount), description: desc || "Cobrança Pix", payerName: payer || undefined } }),
    onSuccess: (res) => {
      setQr({ txId: res.tx.id, qrCode: res.qrCode, qrImage: res.qrImage, amount: res.amount });
      setPaid(false);
      setOpen(false);
      setAmount(""); setDesc(""); setPayer("");
      qc.invalidateQueries({ queryKey: ["txs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Cobrança gerada");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const simulate = useMutation({
    mutationFn: (id: string) => simularPagamento({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["txs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Pagamento confirmado");
    },
  });

  // Detecta pagamento aprovado da cobrança atual
  useEffect(() => {
    if (!qr || paid) return;
    const tx = list.data?.find((t) => t.id === qr.txId);
    if (tx && tx.status === "pago") {
      setPaid(true);
      toast.success(`Pagamento aprovado — ${brl(tx.amount)}`, { duration: 6000 });
    }
  }, [list.data, qr, paid]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Depósitos</h1>
          <p className="text-muted-foreground text-sm mt-1">Gere cobranças Pix e acompanhe pagamentos.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gradient-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Nova cobrança
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Descrição</th>
                <th className="text-left py-3 px-4 font-medium">Pagador</th>
                <th className="text-left py-3 px-4 font-medium">Data</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-right py-3 px-4 font-medium">Valor</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(list.data ?? []).map((t) => (
                <tr key={t.id} className="hover:bg-muted/20">
                  <td className="py-3 px-4 font-medium">{t.description}</td>
                  <td className="py-3 px-4 text-muted-foreground">{t.counterparty ?? "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{new Date(t.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="py-3 px-4"><StatusBadge status={t.status} /></td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-success">+{brl(t.amount)}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {t.status === "pendente" && user.role === "admin" && (
                      <Button size="sm" variant="ghost" onClick={() => simulate.mutate(t.id)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Simular
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDetail(t)}>
                      <Eye className="h-4 w-4 mr-1" /> Ver
                    </Button>
                  </td>
                </tr>
              ))}
              {(!list.data || list.data.length === 0) && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Nenhum depósito ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova cobrança Pix</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex: Cobrança #123" />
            </div>
            <div className="space-y-2">
              <Label>Nome do pagador (opcional)</Label>
              <Input value={payer} onChange={(e) => setPayer(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!amount || create.isPending} className="gradient-primary text-primary-foreground">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar Pix"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qr} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {paid ? `Pagamento aprovado — ${qr && brl(qr.amount)}` : `Pix gerado — ${qr && brl(qr.amount)}`}
            </DialogTitle>
          </DialogHeader>
          {paid ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-success/20 blur-2xl animate-pulse" />
                <div className="relative rounded-full bg-success/15 p-6 border-2 border-success/40">
                  <CheckCircle2 className="h-16 w-16 text-success animate-in zoom-in duration-500" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold flex items-center justify-center gap-2">
                  <PartyPopper className="h-5 w-5 text-success" /> Pagamento confirmado!
                </p>
                <p className="text-sm text-muted-foreground">
                  {qr && brl(qr.amount)} creditado no seu saldo.
                </p>
              </div>
              <Button onClick={() => setQr(null)} className="gradient-primary text-primary-foreground w-full">
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {qr?.qrImage && (
                <div className="flex justify-center">
                  <img src={qr.qrImage} alt="QR Code Pix" className="rounded-lg bg-white p-2 w-56 h-56" />
                </div>
              )}
              <div className="rounded-lg bg-muted p-4">
                <Label className="text-xs">Código copia e cola</Label>
                <div className="mt-2 flex gap-2">
                  <code className="flex-1 text-xs break-all bg-background rounded px-2 py-1.5">{qr?.qrCode}</code>
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(qr?.qrCode ?? ""); toast.success("Copiado"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Aguardando pagamento… o status atualiza sozinho.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TransactionDetailDialog tx={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}
