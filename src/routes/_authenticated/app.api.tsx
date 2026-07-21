import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { criarToken, listarTokens, revogarToken } from "@/lib/api-tokens.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Code2, Copy, Key, Loader2, Plus, Trash2, AlertTriangle, CheckCircle2, FileText, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/api")({
  component: ApiPage,
});

function ApiPage() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ["api-tokens"], queryFn: () => listarTokens() });
  const [openNew, setOpenNew] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const baseUrl = "http://168.222.97.48/api/public/v1";
  const activeToken = tokens.data?.find((t) => t.active);
  const exampleToken = newToken ?? (activeToken ? `pk_live_••••••••${activeToken.last4}` : "SEU_TOKEN_AQUI");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Code2 className="h-7 w-7 text-primary" /> Minha API</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Integre seu sistema à sua conta. Pagamentos gerados via API caem direto no seu saldo.
        </p>
      </div>

      <Card className="p-6 border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong>Como funciona:</strong> cada depósito Pix gerado com seu token é registrado no seu saldo pessoal.
            Quando o cliente paga, o valor entra automaticamente e fica disponível pra sacar tanto pelo dashboard quanto pela API.
            Toda a comunicação com o gateway acontece por trás — você só precisa do seu token.
          </div>
        </div>
      </Card>

      {/* Tokens */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><Key className="h-4 w-4 text-primary" /> Meus tokens</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Use no header <code className="text-xs bg-muted px-1 py-0.5 rounded">Authorization: Bearer pk_live_…</code></p>
          </div>
          <Button onClick={() => setOpenNew(true)} className="gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" /> Novo token
          </Button>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-3 font-medium">Nome</th>
                <th className="text-left py-2 px-3 font-medium">Token</th>
                <th className="text-left py-2 px-3 font-medium">Criado</th>
                <th className="text-left py-2 px-3 font-medium">Último uso</th>
                <th className="text-center py-2 px-3 font-medium">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(tokens.data ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="py-2 px-3 font-medium">{t.name}</td>
                  <td className="py-2 px-3 font-mono text-xs text-muted-foreground">pk_live_••••{t.last4}</td>
                  <td className="py-2 px-3 text-muted-foreground text-xs whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td className="py-2 px-3 text-muted-foreground text-xs whitespace-nowrap">{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString("pt-BR") : "—"}</td>
                  <td className="py-2 px-3 text-center">
                    {t.active
                      ? <Badge variant="outline" className="text-primary border-primary/30">ativo</Badge>
                      : <Badge variant="secondary">revogado</Badge>}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {t.active && <RevokeBtn id={t.id} name={t.name} />}
                  </td>
                </tr>
              ))}
              {(!tokens.data || tokens.data.length === 0) && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Nenhum token ainda. Crie o primeiro pra começar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Documentação */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="font-semibold">Documentação</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              URL base: <code className="text-xs bg-muted px-1 py-0.5 rounded">{baseUrl}</code>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => {
                const txt = buildLlmsTxt(baseUrl, exampleToken);
                navigator.clipboard.writeText(txt);
                toast.success("Documentação copiada — cole na sua IA");
              }}
            >
              <FileText className="h-4 w-4 mr-1" /> Copiar p/ IA
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => {
                const txt = buildLlmsTxt(baseUrl, exampleToken);
                const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "llms.txt"; a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-4 w-4 mr-1" /> Baixar llms.txt
            </Button>
          </div>
        </div>
        <div className="mb-4 rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Dica:</strong> baixe o <code className="text-primary">llms.txt</code> e envie pro ChatGPT / Claude / Cursor / Copilot.
          O arquivo já vem com todos os endpoints, exemplos e seu token — a IA gera o código de integração pra você.
        </div>


        <div className="space-y-6">
          <EndpointDoc
            method="GET" path="/balance" title="Consultar saldo"
            description="Retorna o saldo interno do dono do token."
            curl={`curl ${baseUrl}/balance \\\n  -H "Authorization: Bearer ${exampleToken}"`}
            js={`const res = await fetch("${baseUrl}/balance", {\n  headers: { Authorization: "Bearer ${exampleToken}" }\n});\nconst { recebido, sacado, disponivel } = await res.json();`}
            response={`{\n  "recebido": 1250.00,\n  "sacado": 300.00,\n  "disponivel": 950.00\n}`}
          />

          <EndpointDoc
            method="POST" path="/pix" title="Gerar cobrança Pix"
            description="Cria um Pix. O valor pago cai no seu saldo interno."
            curl={`curl -X POST ${baseUrl}/pix \\\n  -H "Authorization: Bearer ${exampleToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": 10.00, "description": "Pedido #123"}'`}
            js={`const res = await fetch("${baseUrl}/pix", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${exampleToken}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    amount: 10.00,\n    description: "Pedido #123",\n    payerName: "João",       // opcional\n    payerDocument: "12345678900" // opcional\n  })\n});\nconst { id, qrCode, qrImage, status } = await res.json();`}
            response={`{\n  "id": "tx_...",\n  "kind": "deposito",\n  "status": "pendente",\n  "amount": 10.00,\n  "qrCode": "00020126580014BR.GOV.BCB.PIX...",\n  "qrImage": "data:image/png;base64,...",\n  "createdAt": "2026-07-20T..."\n}`}
          />

          <EndpointDoc
            method="GET" path="/pix/{id}" title="Status de um Pix"
            description="Consulta o status atual — sincroniza com o gateway automaticamente."
            curl={`curl ${baseUrl}/pix/tx_abc123 \\\n  -H "Authorization: Bearer ${exampleToken}"`}
            js={`const res = await fetch(\`${baseUrl}/pix/\${id}\`, {\n  headers: { Authorization: "Bearer ${exampleToken}" }\n});\nconst tx = await res.json();`}
            response={`{\n  "id": "tx_...",\n  "status": "pago",\n  "amount": 10.00,\n  "paidAt": "2026-07-20T..."\n}`}
          />

          <EndpointDoc
            method="POST" path="/withdraw" title="Sacar pra chave Pix"
            description="Envia Pix pra chave. Precisa ter saldo disponível."
            curl={`curl -X POST ${baseUrl}/withdraw \\\n  -H "Authorization: Bearer ${exampleToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": 50, "pixKey": "email@ex.com", "keyType": "email"}'`}
            js={`const res = await fetch("${baseUrl}/withdraw", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${exampleToken}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    amount: 50,\n    pixKey: "email@exemplo.com",\n    keyType: "email", // cpf | cnpj | email | telefone | aleatoria\n    description: "Saque"\n  })\n});`}
            response={`{\n  "id": "tx_...",\n  "kind": "saque",\n  "status": "pendente",\n  "amount": 50.00\n}`}
          />

          <EndpointDoc
            method="POST" path="/withdraw/qrcode" title="Sacar pagando QR Pix"
            description="Paga um copia-e-cola / QR Pix (estático ou dinâmico)."
            curl={`curl -X POST ${baseUrl}/withdraw/qrcode \\\n  -H "Authorization: Bearer ${exampleToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"qrCode": "00020126..."}'`}
            js={`const res = await fetch("${baseUrl}/withdraw/qrcode", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${exampleToken}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    qrCode: "00020126...",\n    amount: 25 // obrigatório só se o QR for estático sem valor\n  })\n});`}
            response={`{\n  "id": "tx_...",\n  "status": "pendente",\n  "amount": 25.00\n}`}
          />

          <EndpointDoc
            method="GET" path="/withdraw/{id}" title="Status de um saque"
            description="Sincroniza com o gateway."
            curl={`curl ${baseUrl}/withdraw/tx_abc \\\n  -H "Authorization: Bearer ${exampleToken}"`}
            js={`const res = await fetch(\`${baseUrl}/withdraw/\${id}\`, {\n  headers: { Authorization: "Bearer ${exampleToken}" }\n});`}
            response={`{\n  "id": "tx_...",\n  "status": "pago",\n  "paidAt": "2026-07-20T..."\n}`}
          />

          <EndpointDoc
            method="GET" path="/transactions?limit=50" title="Listar transações"
            description="Últimas movimentações do dono do token."
            curl={`curl "${baseUrl}/transactions?limit=20" \\\n  -H "Authorization: Bearer ${exampleToken}"`}
            js={`const res = await fetch("${baseUrl}/transactions?limit=20", {\n  headers: { Authorization: "Bearer ${exampleToken}" }\n});\nconst { data, total } = await res.json();`}
            response={`{\n  "data": [ { "id": "...", "kind": "deposito", "status": "pago", ... } ],\n  "total": 42\n}`}
          />
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="font-semibold text-sm mb-2">Códigos de erro</h3>
          <ul className="text-xs text-muted-foreground space-y-1 font-mono">
            <li><span className="text-destructive">401</span> unauthorized — token ausente, inválido ou revogado</li>
            <li><span className="text-destructive">400</span> invalid_input / invalid_json — body malformado</li>
            <li><span className="text-destructive">402</span> insufficient_balance — saldo insuficiente pro saque</li>
            <li><span className="text-destructive">404</span> not_found — id não encontrado ou de outro dono</li>
            <li><span className="text-destructive">502</span> gateway_error — falha na comunicação com o Pix</li>
          </ul>
        </div>
      </Card>

      <NewTokenDialog
        open={openNew}
        onOpenChange={(o) => { setOpenNew(o); if (!o) setNewToken(null); }}
        onCreated={(raw) => { setNewToken(raw); qc.invalidateQueries({ queryKey: ["api-tokens"] }); }}
        rawToken={newToken}
      />
    </div>
  );
}

function EndpointDoc({ method, path, title, description, curl, js, response }: {
  method: "GET" | "POST"; path: string; title: string; description: string;
  curl: string; js: string; response: string;
}) {
  const methodColor = method === "GET" ? "bg-blue-500/15 text-blue-400" : "bg-primary/15 text-primary";
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${methodColor}`}>{method}</span>
          <code className="text-sm font-mono">{path}</code>
          <span className="ml-2 text-sm font-medium">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Tabs defaultValue="curl" className="p-4">
        <TabsList className="mb-3">
          <TabsTrigger value="curl">cURL</TabsTrigger>
          <TabsTrigger value="js">JavaScript</TabsTrigger>
          <TabsTrigger value="response">Resposta</TabsTrigger>
        </TabsList>
        <TabsContent value="curl"><CodeBlock code={curl} /></TabsContent>
        <TabsContent value="js"><CodeBlock code={js} /></TabsContent>
        <TabsContent value="response"><CodeBlock code={response} /></TabsContent>
      </Tabs>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-muted/40 rounded-lg p-3 pr-10 overflow-x-auto text-xs font-mono whitespace-pre">{code}</pre>
      <Button
        size="icon" variant="ghost"
        className="absolute top-2 right-2 h-7 w-7 opacity-60 hover:opacity-100"
        onClick={() => { navigator.clipboard.writeText(code); toast.success("Copiado"); }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function RevokeBtn({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const rev = useMutation({
    mutationFn: () => revogarToken({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-tokens"] }); toast.success(`${name} revogado`); },
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revogar {name}?</AlertDialogTitle>
          <AlertDialogDescription>O token para de funcionar imediatamente. Essa ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => rev.mutate()}>Revogar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NewTokenDialog({ open, onOpenChange, onCreated, rawToken }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onCreated: (raw: string) => void; rawToken: string | null;
}) {
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => criarToken({ data: { name: name.trim() } }),
    onSuccess: (r) => { onCreated(r.token); setName(""); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {rawToken ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /> Token criado</DialogTitle>
              <DialogDescription>Copie e guarde agora. Por segurança não conseguimos mostrar de novo.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 p-3 font-mono text-xs break-all">{rawToken}</div>
              <Button
                className="w-full gradient-primary text-primary-foreground"
                onClick={() => { navigator.clipboard.writeText(rawToken); toast.success("Copiado"); }}
              >
                <Copy className="h-4 w-4 mr-2" /> Copiar token
              </Button>
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <span>Trate como senha. Nunca exponha em código do front-end nem em repositórios públicos.</span>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Já guardei</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader><DialogTitle>Criar novo token</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome (pra identificar)</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Produção, Servidor node, Loja X" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()} className="gradient-primary text-primary-foreground">
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function buildLlmsTxt(baseUrl: string, token: string): string {
  return `# API do Dashboard — Documentação para IAs

Esta API é um wrapper próprio sobre um gateway Pix. Todo pagamento gerado
com um token cai no saldo do dono do token. O usuário final deve usar SOMENTE
esta API — nunca chamar o gateway original diretamente.

## Autenticação
Envie o token no header em TODAS as requisições:
  Authorization: Bearer ${token}

Formato do token: pk_live_... (32+ chars). Trate como senha.

## URL base
${baseUrl}

## Formato
- Requests JSON: Content-Type: application/json
- Respostas: JSON UTF-8
- Valores monetários: number em BRL (ex: 10.50 = R$ 10,50)
- Datas: ISO 8601 UTC

---

## Endpoints

### GET /balance
Retorna o saldo interno do dono do token.

Resposta 200:
{
  "recebido": 1250.00,   // total já pago (entrou)
  "sacado": 300.00,      // total já sacado (saiu)
  "disponivel": 950.00   // recebido - sacado
}

Exemplo:
  curl ${baseUrl}/balance -H "Authorization: Bearer ${token}"

---

### POST /pix
Gera uma cobrança Pix. Retorna QR Code copia-e-cola + imagem base64.

Body:
{
  "amount": 10.00,               // obrigatório, número, mínimo 0.01
  "description": "Pedido #123",  // obrigatório, string
  "payerName": "João Silva",     // opcional
  "payerDocument": "12345678900" // opcional, CPF/CNPJ sem máscara
}

Resposta 200:
{
  "id": "tx_abc123",
  "kind": "deposito",
  "status": "pendente",  // pendente | pago | cancelado
  "amount": 10.00,
  "qrCode": "00020126580014BR.GOV.BCB.PIX...",  // copia-e-cola
  "qrImage": "data:image/png;base64,iVBOR...",   // PNG pronto pra <img src>
  "createdAt": "2026-07-20T12:00:00.000Z"
}

---

### GET /pix/{id}
Consulta status de um Pix. Sincroniza com o gateway automaticamente.

Resposta 200:
{
  "id": "tx_abc123",
  "status": "pago",
  "amount": 10.00,
  "paidAt": "2026-07-20T12:05:32.000Z"  // null se ainda pendente
}

Erros: 404 not_found (id inexistente ou de outro dono)

---

### POST /withdraw
Envia um Pix pra uma chave. Debita do saldo disponível.

Body:
{
  "amount": 50.00,                    // obrigatório
  "pixKey": "email@exemplo.com",      // obrigatório
  "keyType": "email",                 // cpf | cnpj | email | telefone | aleatoria
  "description": "Saque cliente"      // opcional
}

Resposta 200:
{
  "id": "tx_xyz789",
  "kind": "saque",
  "status": "pendente",
  "amount": 50.00
}

Erros: 402 insufficient_balance

---

### POST /withdraw/qrcode
Paga um QR Pix (copia-e-cola). Funciona pra estático e dinâmico.

Body:
{
  "qrCode": "00020126580014BR.GOV.BCB.PIX...",
  "amount": 25.00   // obrigatório APENAS se o QR for estático sem valor
}

Resposta: mesma estrutura do POST /withdraw.

---

### GET /withdraw/{id}
Status de um saque. Sincroniza com o gateway.

Resposta 200:
{
  "id": "tx_xyz789",
  "status": "pago",
  "paidAt": "2026-07-20T12:10:00.000Z"
}

---

### GET /transactions?limit=50
Lista as últimas transações do dono do token.

Query params:
- limit: número, padrão 50, máximo 200

Resposta 200:
{
  "data": [
    {
      "id": "tx_...",
      "kind": "deposito",     // deposito | saque
      "status": "pago",
      "amount": 10.00,
      "description": "...",
      "createdAt": "...",
      "paidAt": "..."
    }
  ],
  "total": 42
}

---

## Códigos de erro

Todas as respostas de erro seguem o formato:
{ "error": "<code>", "message": "<detalhe>" }

- 400 invalid_input       — body/campos inválidos (Zod)
- 400 invalid_json        — JSON malformado
- 401 unauthorized        — token ausente, inválido ou revogado
- 402 insufficient_balance — saldo insuficiente pro saque
- 404 not_found           — id não encontrado (ou pertence a outro dono)
- 502 gateway_error       — falha na comunicação com o Pix

---

## Fluxo típico de integração (checkout)

1. Cliente confirma pedido no seu sistema.
2. POST /pix { amount, description }  -> guarde \`id\` no seu banco.
3. Mostre o \`qrImage\` (base64) ou \`qrCode\` (copia-e-cola) pro cliente.
4. Faça polling: GET /pix/{id} a cada 5s (ou webhook, se disponível).
5. Quando \`status === "pago"\`, libere o produto/serviço.

## Boas práticas

- Nunca coloque o token em código do front-end. Use SEMPRE do servidor.
- Trate 502 com retry exponencial.
- Idempotência: guarde o \`id\` retornado; não crie 2 cobranças pro mesmo pedido.
- Para valores em centavos no seu sistema, divida por 100 antes de enviar.
`;
}
