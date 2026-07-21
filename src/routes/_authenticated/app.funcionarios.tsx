import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listarFuncionarios, criarFuncionario, atualizarFuncionario,
  excluirFuncionario, pagarTodos, obterAutoPay, salvarAutoPay,
} from "@/lib/employees.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { brl } from "@/components/tx-helpers";
import { Loader2, Plus, Users, Zap, Trash2, Pencil, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/funcionarios")({
  beforeLoad: ({ context }) => {
    if (context.user.role !== "admin") throw redirect({ to: "/app/meus-recebimentos" });
  },
  component: FuncionariosPage,
});

function FuncionariosPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["employees"], queryFn: () => listarFuncionarios() });
  const auto = useQuery({ queryKey: ["autopay"], queryFn: () => obterAutoPay() });
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<null | (typeof list.data extends (infer T)[] | undefined ? T : never)>(null);

  const pagar = useMutation({
    mutationFn: () => pagarTodos(),
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast.success(`${r.results.filter((x: { ok: boolean }) => x.ok).length}/${r.total} pagamentos processados`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveAuto = useMutation({
    mutationFn: (v: { enabled: boolean; hour: number; minute: number }) => salvarAutoPay({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["autopay"] }); toast.success("Automação salva"); },
  });
  const autoTime = formatTime(auto.data?.hour ?? 9, auto.data?.minute ?? 0);

  function updateAutoTime(value: string) {
    const parsed = parseTime(value);
    if (!parsed) return;
    saveAuto.mutate({ enabled: auto.data?.enabled ?? false, hour: parsed.hour, minute: parsed.minute });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="h-7 w-7 text-primary" /> Funcionários & Suporte</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie sua equipe e pagamentos diários automáticos.</p>
        </div>
        <Button onClick={() => setOpenNew(true)} className="gradient-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Adicionar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Pagar todos hoje</h2>
              <p className="text-sm text-muted-foreground mt-1">Dispara Pix pra todos os funcionários ativos com valor diário definido.</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground" disabled={pagar.isPending}>
                  {pagar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pagar todos"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar pagamento em lote</AlertDialogTitle>
                  <AlertDialogDescription>
                    Serão enviados Pix pra todos os funcionários ativos. Confirma?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => pagar.mutate()}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Pagamento automático</h2>
          <p className="text-sm text-muted-foreground mt-1">O sistema dispara os pagamentos todo dia no horário abaixo.</p>
          <div className="mt-4 flex items-center gap-3">
            <Switch
              checked={auto.data?.enabled ?? false}
              onCheckedChange={(v) => saveAuto.mutate({ enabled: v, hour: auto.data?.hour ?? 9, minute: auto.data?.minute ?? 0 })}
            />
            <Input
              type="time"
              value={autoTime}
              onChange={(e) => updateAutoTime(e.target.value)}
              className="w-32"
              aria-label="Horário do pagamento automático"
            />
            <span className="text-xs text-muted-foreground">Brasília</span>
          </div>
          {auto.data?.lastRunAt && (
            <p className="text-xs text-muted-foreground mt-3">Última execução: {new Date(auto.data.lastRunAt).toLocaleString("pt-BR")}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Atenção:</strong> no VPS, o cron só roda enquanto o processo Node estiver ativo (PM2).
          </p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="w-full overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left py-3 px-4 font-medium">Nome</th>
              <th className="text-left py-3 px-4 font-medium">Tipo</th>
              <th className="text-left py-3 px-4 font-medium">E-mail</th>
              <th className="text-left py-3 px-4 font-medium">Chave Pix</th>
              <th className="text-right py-3 px-4 font-medium">Diária</th>
              <th className="text-center py-3 px-4 font-medium">Ativo</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(list.data ?? []).map((e) => (
              <tr key={e.id}>
                <td className="py-3 px-4 font-medium">{e.name}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold ${e.role === "cliente" ? "bg-blue-500/15 text-blue-400" : "bg-primary/15 text-primary"}`}>
                    {e.role === "cliente" ? "Cliente" : "Funcionário"}
                  </span>
                </td>
                <td className="py-3 px-4 text-muted-foreground">{e.email}</td>
                <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{e.pixKey || <span className="italic text-muted-foreground/60">— o próprio usuário escolhe</span>}</td>
                <td className="py-3 px-4 text-right font-mono">{e.role === "cliente" ? "—" : brl(e.dailyAmount ?? 0)}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block h-2 w-2 rounded-full ${e.active ? "bg-success" : "bg-muted-foreground"}`} />
                </td>
                <td className="py-3 px-4 text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></Button>
                  <DeleteBtn id={e.id} name={e.name} />
                </td>
              </tr>
            ))}
            {(!list.data || list.data.length === 0) && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-8">Nenhum cadastro.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      <NewEmployeeDialog open={openNew} onOpenChange={setOpenNew} />
      {editing && <EditEmployeeDialog employee={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  );
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function DeleteBtn({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => excluirFuncionario({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success(`${name} removido`); },
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover {name}?</AlertDialogTitle>
          <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => del.mutate()}>Remover</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NewEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", password: "", pixKey: "", dailyAmount: "", role: "funcionario" as "funcionario" | "cliente" });
  const create = useMutation({
    mutationFn: () => criarFuncionario({
      data: {
        name: f.name, email: f.email, password: f.password, pixKey: f.pixKey,
        dailyAmount: parseFloat(f.dailyAmount) || 0, active: true, role: f.role,
      },
    }),
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.error); return; }
      qc.invalidateQueries({ queryKey: ["employees"] });
      onOpenChange(false);
      setF({ name: "", email: "", password: "", pixKey: "", dailyAmount: "", role: "funcionario" });
      toast.success(f.role === "cliente" ? "Cliente adicionado" : "Funcionário adicionado");
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar {f.role === "cliente" ? "cliente" : "funcionário"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo de cadastro</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={f.role === "funcionario" ? "default" : "outline"} className={f.role === "funcionario" ? "gradient-primary text-primary-foreground" : ""} onClick={() => setF({ ...f, role: "funcionario" })}>Funcionário</Button>
              <Button type="button" variant={f.role === "cliente" ? "default" : "outline"} className={f.role === "cliente" ? "gradient-primary text-primary-foreground" : ""} onClick={() => setF({ ...f, role: "cliente" })}>Cliente</Button>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Senha</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Chave Pix <span className="text-xs text-muted-foreground">(opcional — pagamentos em lote precisam dela)</span></Label><Input value={f.pixKey} onChange={(e) => setF({ ...f, pixKey: e.target.value })} placeholder="Deixe em branco pra deixar o próprio usuário escolher no saque" /></div>
          {f.role === "funcionario" && (
            <div className="space-y-1.5"><Label>Valor diário (R$)</Label><Input type="number" step="0.01" value={f.dailyAmount} onChange={(e) => setF({ ...f, dailyAmount: e.target.value })} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="gradient-primary text-primary-foreground">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEmployeeDialog({ employee, open, onOpenChange }: { employee: { id: string; name: string; pixKey?: string; dailyAmount?: number; active: boolean }; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: employee.name,
    pixKey: employee.pixKey ?? "",
    dailyAmount: String(employee.dailyAmount ?? 0),
    active: employee.active,
    password: "",
  });
  const save = useMutation({
    mutationFn: () => atualizarFuncionario({
      data: {
        id: employee.id,
        name: f.name,
        pixKey: f.pixKey,
        dailyAmount: parseFloat(f.dailyAmount) || 0,
        active: f.active,
        password: f.password || undefined,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); onOpenChange(false); toast.success("Salvo"); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar {employee.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Chave Pix</Label><Input value={f.pixKey} onChange={(e) => setF({ ...f, pixKey: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Valor diário (R$)</Label><Input type="number" step="0.01" value={f.dailyAmount} onChange={(e) => setF({ ...f, dailyAmount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Nova senha (opcional)</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /><Label>Ativo</Label></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-primary text-primary-foreground">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
