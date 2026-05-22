import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldOff, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";

interface PacienteFalta {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  total_faltas: number;
  faltas_consecutivas: number;
  status_falta: string;
  unidade_id?: string | null;
  ultima_falta?: string | null;
  is_tfd?: boolean;
  possui_ordem_judicial?: boolean;
}

const Faltosos: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const { userUnidadeId: unidadeId } = useUnidadeFilter();
  const [list, setList] = useState<PacienteFalta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [periodoDias, setPeriodoDias] = useState<string>("0");
  const [mostrarExcecoes, setMostrarExcecoes] = useState(false);
  const [regularizarModal, setRegularizarModal] = useState<{ open: boolean; paciente: PacienteFalta | null }>({ open: false, paciente: null });
  const [motivoRegularizacao, setMotivoRegularizacao] = useState("");
  const [liberarTodas, setLiberarTodas] = useState(false);
  const [savingRegularizacao, setSavingRegularizacao] = useState(false);

  const allowedRoles = ["master", "gestor", "coordenador", "recepcao"];
  const canAccess = isGlobalAdmin || (user && allowedRoles.includes(user.role));
  const canUnblock = isGlobalAdmin || (user && ["master", "gestor"].includes(user.role));

  const load = async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from("pacientes")
        .select("id, nome, cpf, telefone, total_faltas, faltas_consecutivas, status_falta, unidade_id, is_tfd, possui_ordem_judicial")
        .in("status_falta", ["FALTOSO", "BLOQUEADO"])
        .order("total_faltas", { ascending: false })
        .limit(1000);

      if (unidadeId && user?.usuario !== "admin.sms") {
        query = query.eq("unidade_id", unidadeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const ids = (data || []).map((p: any) => p.id);
      let ultimasFaltas: Record<string, string> = {};
      if (ids.length) {
        const { data: ags } = await (supabase as any)
          .from("agendamentos")
          .select("paciente_id, data")
          .in("paciente_id", ids)
          .eq("status", "falta")
          .order("data", { ascending: false });
        (ags || []).forEach((a: any) => {
          if (!ultimasFaltas[a.paciente_id]) ultimasFaltas[a.paciente_id] = a.data;
        });
      }

      setList((data || []).map((p: any) => ({ ...p, ultima_falta: ultimasFaltas[p.id] || null })));
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar lista de faltosos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId]);

  const filtered = useMemo(() => {
    const dias = parseInt(periodoDias) || 0;
    const limite = dias > 0 ? new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10) : null;
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (filtroStatus !== "todos" && p.status_falta !== filtroStatus) return false;
      if (q && !p.nome.toLowerCase().includes(q) && !(p.cpf || "").includes(q)) return false;
      if (limite && p.ultima_falta && p.ultima_falta < limite) return false;
      return true;
    });
  }, [list, filtroStatus, search, periodoDias]);

  const handleRemoverBloqueio = async (p: PacienteFalta) => {
    if (!canUnblock) { toast.error("Sem permissão para desbloquear."); return; }
    const motivo = window.prompt(`Justifique o desbloqueio de ${p.nome}:`, "");
    if (motivo === null) return;
    if (!motivo.trim()) { toast.error("Justificativa obrigatória."); return; }
    try {
      const { error } = await (supabase as any).rpc("desbloquear_paciente_faltas", {
        p_paciente_id: p.id,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      toast.success(`${p.nome} liberado(a). Faltas zeradas.`);
      load();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao desbloquear.");
    }
  };

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <ShieldOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Você não tem permissão para acessar esta página.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <PageHeader
        title="Pacientes Faltosos"
        subtitle="Controle de faltas, alertas e bloqueios automáticos por excesso de faltas."
      />

      <Card className="shadow-card border-0">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Busca</Label>
              <Input placeholder="Nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="FALTOSO">FALTOSO</SelectItem>
                  <SelectItem value="BLOQUEADO">BLOQUEADO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={periodoDias} onValueChange={setPeriodoDias}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Qualquer</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 h-9 border rounded-md px-3 bg-muted/20">
              <Switch id="show-excecoes" checked={mostrarExcecoes} onCheckedChange={setMostrarExcecoes} />
              <Label htmlFor="show-excecoes" className="text-xs cursor-pointer">Ver exceções</Label>
            </div>
            <Button variant="outline" onClick={load} className="h-9">
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Nenhum paciente faltoso encontrado.</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead className="text-center">Total Faltas</TableHead>
                    <TableHead className="text-center">Consecutivas</TableHead>
                    <TableHead>Última Falta</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {p.nome}
                          {p.is_tfd && <Badge variant="outline" className="text-[10px] py-0 h-4 border-warning text-warning">TFD</Badge>}
                          {p.possui_ordem_judicial && <Badge variant="outline" className="text-[10px] py-0 h-4 border-warning text-warning">JUDICIAL</Badge>}
                        </div>
                        {p.cpf && <div className="text-xs text-muted-foreground">{p.cpf}</div>}
                      </TableCell>
                      <TableCell className="text-center font-semibold">{p.total_faltas}</TableCell>
                      <TableCell className="text-center">{p.faltas_consecutivas}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.ultima_falta ? new Date(p.ultima_falta + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell>
                        {p.status_falta === "BLOQUEADO" ? (
                          <Badge className="bg-destructive text-destructive-foreground">BLOQUEADO</Badge>
                        ) : (
                          <Badge className="bg-warning/15 text-warning border border-warning/30">FALTOSO</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canUnblock ? (
                          <Button size="sm" variant="outline" onClick={() => handleRemoverBloqueio(p)} className="text-xs h-8">
                            Regularizar
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem permissão</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Regularização */}
      <Dialog open={regularizarModal.open} onOpenChange={(v) => !v && setRegularizarModal({ open: false, paciente: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Regularizar Faltas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 p-3 rounded-md space-y-1">
              <p className="text-sm font-medium">{regularizarModal.paciente?.nome}</p>
              <p className="text-xs text-muted-foreground">Faltas injustificadas acumuladas: {regularizarModal.paciente?.total_faltas}</p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm">Motivo da Regularização *</Label>
              <Textarea 
                placeholder="Ex: Paciente justificou via telefone, erro de registro, etc."
                value={motivoRegularizacao}
                onChange={(e) => setMotivoRegularizacao(e.target.value.toUpperCase())}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/20">
              <Switch id="liberar-todas" checked={liberarTodas} onCheckedChange={setLiberarTodas} />
              <div className="flex flex-col">
                <Label htmlFor="liberar-todas" className="text-sm cursor-pointer">Liberar todas as faltas</Label>
                <p className="text-[10px] text-muted-foreground">Se desmarcado, regulariza apenas a falta mais recente.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegularizarModal({ open: false, paciente: null })}>Cancelar</Button>
            <Button onClick={handleRegularizar} disabled={savingRegularizacao}>
              {savingRegularizacao ? "Processando..." : "Confirmar Regularização"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Faltosos;
