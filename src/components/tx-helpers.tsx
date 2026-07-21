import { Badge } from "@/components/ui/badge";
import type { TxStatus, TxKind } from "@/server/db/schema";

export function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const statusStyles: Record<TxStatus, string> = {
  pago: "bg-success/15 text-success border-success/30",
  pendente: "bg-warning/15 text-warning border-warning/30",
  expirado: "bg-muted text-muted-foreground border-border",
  falhou: "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ status }: { status: TxStatus }) {
  return <Badge variant="outline" className={statusStyles[status]}>{status}</Badge>;
}

export const kindLabel: Record<TxKind, string> = {
  deposito: "Depósito",
  saque: "Saque",
  pagamento_funcionario: "Pagamento equipe",
};
