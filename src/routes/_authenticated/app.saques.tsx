import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { criarSaque, criarSaqueQr, decodificarQr } from "@/lib/evopay.functions";
import { listarTransacoes } from "@/lib/transactions.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge, brl } from "@/components/tx-helpers";
import { TransactionDetailDialog } from "@/components/transaction-detail-dialog";
import { QrScanner } from "@/components/qr-scanner";
import { parsePixBrCode } from "@/lib/pix-emv";
import { Loader2, ArrowUpFromLine, Camera, Eye, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/server/db/schema";

export const Route = createFileRoute("/_authenticated/app/saques")({
  component: SaquesPage,
});

type KeyType = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

const keyPlaceholders: Record<KeyType, string> = {
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  email: "nome@exemplo.com",
  telefone: "+55 11 99999-9999",
  aleatoria: "chave-aleatoria-uuid",
};

function SaquesPage() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [keyType, setKeyType] = useState<KeyType>("aleatoria");
  const [pixKey, setPixKey] = useState("");
  const [desc, setDesc] = useState("");
  const [brCode, setBrCode] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [qrInfo, setQrInfo] = useState<{ dynamic: boolean; amount?: number; name?: string } | null>(null);
  const [tab, setTab] = useState<"chave" | "qr">("chave");
  const [decoding, setDecoding] = useState(false);

  const list = useQuery({
    queryKey: ["txs", "saque"],
    queryFn: () => listarTransacoes({ data: { kind: "saque", limit: 5 } }),
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === "pendente") ? 8000 : false),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (tab === "qr") {
        return criarSaqueQr({
          data: {
            qrCode: brCode.trim(),
            amount: qrInfo?.dynamic ? undefined : parseFloat(amount),
            description: desc || undefined,
          },
        });
      }
      return criarSaque({
        data: {
          amount: parseFloat(amount),
          pixKey,
          keyType,
          beneficiaryName: "—",
          description: desc || undefined,
        },
      });
    },
    onSuccess: () => {
      setAmount(""); setPixKey(""); setDesc(""); setBrCode(""); setMerchant(null); setQrInfo(null);
      qc.invalidateQueries({ queryKey: ["txs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["saldo"] });
      toast.success("Saque solicitado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Auto-decodifica o QR conforme o texto muda (debounced).
  useEffect(() => {
    const code = brCode.trim();
    if (!code || code.length < 20) {
      setQrInfo(null);
      setMerchant(null);
      return;
    }
    const parsed = parsePixBrCode(code);
    if (parsed?.pixKey) {
      setPixKey(parsed.pixKey);
      if (parsed.keyType) setKeyType(parsed.keyType);
      if (parsed.amount) setAmount(String(parsed.amount));
      if (parsed.description) setDesc(parsed.description);
      setMerchant(parsed.merchantName ?? null);
      setQrInfo({ dynamic: false, amount: parsed.amount, name: parsed.merchantName });
      return;
    }
    // QR dinâmico ou não parseável localmente — pergunta pro EvoPay.
    let cancelled = false;
    const t = setTimeout(async () => {
      setDecoding(true);
      try {
        const info = await decodificarQr({ data: { qrCode: code } });
        if (cancelled) return;
        setQrInfo({ dynamic: info.qrCodeType === "DYNAMIC", amount: info.amount, name: info.name });
        setMerchant(info.name ?? null);
        if (info.amount) setAmount(String(info.amount));
        if (info.additionalInfo) setDesc(info.additionalInfo);
      } catch (e) {
        if (!cancelled) toast.error("QR Pix inválido — " + (e as Error).message);
      } finally {
        if (!cancelled) setDecoding(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [brCode]);

  function onQrDecoded(text: string) {
    setBrCode(text);
    setTab("qr");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Saques</h1>
        <p className="text-muted-foreground text-sm mt-1">Envie Pix por chave ou pagando um QR.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card className="p-6 h-fit">
          <h2 className="font-semibold flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4 text-primary" /> Novo saque</h2>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "chave" | "qr")} className="mt-4">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="chave">Chave</TabsTrigger>
              <TabsTrigger value="qr">QR / Copia‑cola</TabsTrigger>
            </TabsList>

            <TabsContent value="chave" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Tipo de chave</Label>
                <Select value={keyType} onValueChange={(v) => setKeyType(v as KeyType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="aleatoria">Chave aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chave Pix</Label>
                <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder={keyPlaceholders[keyType]} />
              </div>
            </TabsContent>

            <TabsContent value="qr" className="mt-4 space-y-3">
              <Textarea
                value={brCode}
                onChange={(e) => setBrCode(e.target.value)}
                placeholder="Cole aqui o código Pix copia‑e‑cola…"
                className="min-h-[100px] font-mono text-xs"
              />
              <Button type="button" variant="outline" className="w-full" onClick={() => setScanOpen(true)}>
                <Camera className="h-4 w-4 mr-1" /> Escanear com câmera
              </Button>
              {decoding && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Lendo QR…
                </div>
              )}
              {qrInfo && (
                <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1 text-primary">
                    <CheckCircle2 className="h-3 w-3" /> QR {qrInfo.dynamic ? "dinâmico" : "estático"} reconhecido
                  </div>
                  {merchant && <div><span className="text-muted-foreground">Recebedor:</span> {merchant}</div>}
                  {qrInfo.amount && <div><span className="text-muted-foreground">Valor:</span> {brl(qrInfo.amount)}</div>}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Valor (R$) {qrInfo?.dynamic && <span className="text-xs text-muted-foreground">(definido pelo QR)</span>}</Label>
              <Input
                type="number" step="0.01" min="0.01"
                required={!qrInfo?.dynamic}
                disabled={!!qrInfo?.dynamic}
                value={qrInfo?.dynamic && qrInfo.amount ? String(qrInfo.amount) : amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <Button
              type="submit"
              disabled={create.isPending || (tab === "chave" ? !pixKey : !brCode.trim())}
              className="w-full gradient-primary text-primary-foreground"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar Pix"}
            </Button>
          </form>
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold">Últimos saques</h2>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Chave</th>
                  <th className="text-left py-3 px-4 font-medium">Data</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-right py-3 px-4 font-medium">Valor</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(list.data ?? []).map((t) => (
                  <tr key={t.id} className="hover:bg-muted/20">
                    <td className="py-3 px-4 text-muted-foreground text-xs break-all">{t.pixKey}</td>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{new Date(t.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="py-3 px-4"><StatusBadge status={t.status} /></td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">−{brl(t.amount)}</td>
                    <td className="py-3 px-4 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(t)}>
                        <Eye className="h-4 w-4 mr-1" /> Ver
                      </Button>
                    </td>
                  </tr>
                ))}
                {(!list.data || list.data.length === 0) && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-8">Nenhum saque ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <QrScanner open={scanOpen} onOpenChange={setScanOpen} onDecoded={onQrDecoded} />
      <TransactionDetailDialog tx={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}
