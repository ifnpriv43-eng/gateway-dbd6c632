import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge, brl, kindLabel } from "@/components/tx-helpers";
import { Copy, Download, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { atualizarStatusTransacao } from "@/lib/evopay.functions";
import type { Transaction } from "@/server/db/schema";

interface Props {
  tx: Transaction | null;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-border/50 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

export function TransactionDetailDialog({ tx, onOpenChange }: Props) {
  const qc = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => atualizarStatusTransacao({ data: { id: tx!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["txs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Status sincronizado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function downloadReceipt() {
    if (!tx) return;
    const lines = [
      "COMPROVANTE — Lynx Wallet",
      "".padEnd(40, "-"),
      `Tipo:          ${kindLabel[tx.kind]}`,
      `Descrição:     ${tx.description}`,
      `Valor:         ${brl(tx.amount)}`,
      `Status:        ${tx.status.toUpperCase()}`,
      `Data:          ${new Date(tx.createdAt).toLocaleString("pt-BR")}`,
      tx.paidAt ? `Pago em:       ${new Date(tx.paidAt).toLocaleString("pt-BR")}` : "",
      tx.counterparty ? `Contraparte:   ${tx.counterparty}` : "",
      tx.pixKey ? `Chave Pix:     ${tx.pixKey}` : "",
      tx.externalId ? `ID gateway:    ${tx.externalId}` : "",
      `ID interno:    ${tx.id}`,
    ].filter(Boolean).join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprovante-${tx.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={!!tx} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Comprovante</span>
            {tx && <StatusBadge status={tx.status} />}
          </DialogTitle>
        </DialogHeader>

        {tx && (
          <div className="space-y-4">
            <div className="text-center py-4 bg-muted/40 rounded-lg">
              <div className="text-xs uppercase text-muted-foreground">{kindLabel[tx.kind]}</div>
              <div className={`mt-1 text-3xl font-bold font-display ${tx.kind === "deposito" ? "text-success" : ""}`}>
                {tx.kind === "deposito" ? "+" : "−"}{brl(tx.amount)}
              </div>
            </div>

            <div>
              <Row label="Descrição" value={tx.description} />
              <Row label="Contraparte" value={tx.counterparty} />
              <Row label="Chave Pix" value={tx.pixKey} mono />
              <Row label="Criado em" value={new Date(tx.createdAt).toLocaleString("pt-BR")} />
              <Row label="Pago em" value={tx.paidAt ? new Date(tx.paidAt).toLocaleString("pt-BR") : undefined} />
              <Row label="ID gateway" value={tx.externalId} mono />
              <Row label="ID interno" value={tx.id} mono />
            </div>

            {tx.qrImage && (
              <div className="flex justify-center py-2">
                <img src={tx.qrImage} alt="QR Code" className="rounded-lg bg-white p-2 w-48 h-48" />
              </div>
            )}
            {tx.qrCode && (
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs text-muted-foreground mb-2">Copia e cola</div>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs break-all bg-background rounded px-2 py-1.5">{tx.qrCode}</code>
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(tx.qrCode!); toast.success("Copiado"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {tx?.externalId && (
            <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Atualizar
            </Button>
          )}
          <Button variant="outline" onClick={downloadReceipt}>
            <Download className="h-4 w-4 mr-1" /> Baixar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
