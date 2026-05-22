import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldOff, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";

interface PacienteFalta {
  id: string;
  paciente_id: string;
  profissional_id: string;
  nome_paciente: string;
  nome_profissional: string;
  total_faltas: number;
  faltas_consecutivas: number;
  status_falta: string;
  ultima_falta?: string | null;
  is_tfd?: boolean;
  possui_ordem_judicial?: boolean;
  unidade_id?: string | null;
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
      // Carrega dados da nova tabela por profissional
      let query = supabase
        .from("paciente_faltas_profissional")
        .select(`
          id,
          paciente_id,
          profissional_id,
          total_faltas,
          faltas_consecutivas,
          status_falta,
          ultima_falta,
          pacientes (nome, cpf, telefone, unidade_id, is_tfd, possui_ordem_judicial),
          funcionarios (nome)
        `)
        .neq("status_falta", "OK")
        .order("total_faltas", { ascending: false });

      if (unidadeId && user?.usuario !== "admin.sms") {
        query = query.eq("pacientes.unidade_id", unidadeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mappedData: PacienteFalta[] = (data || []).map((item: any) => ({
        id: item.id,
        paciente_id: item.paciente_id,
        profissional_id: item.profissional_id,
        nome_paciente: item.pacientes?.nome || "Desconhecido",
        nome_profissional: item.funcionarios?.nome || "Desconhecido",
        total_faltas: item.total_faltas,
        faltas_consecutivas: item.faltas_consecutivas,
        status_falta: item.status_falta,
        ultima_falta: item.ultima_falta,
        is_tfd: item.pacientes?.is_tfd,
        possui_ordem_judicial: item.pacientes?.possui_ordem_judicial,
        unidade_id: item.pacientes?.unidade_id
      }));

      setList(mappedData);
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
      // Regra de Exceção TFD/Ordem Judicial
      if (!mostrarExcecoes && (p.is_tfd || p.possui_ordem_judicial)) return false;

      if (filtroStatus !== "todos" && p.status_falta !== filtroStatus) return false;
      if (q && !p.nome_paciente.toLowerCase().includes(q)) return false;
      if (limite && p.ultima_falta && p.ultima_falta < limite) return false;
      return true;
    });
  }, [list, filtroStatus, search, periodoDias, mostrarExcecoes]);

  const handleRegularizar = async () => {
    if (!regularizarModal.paciente || !motivoRegularizacao.trim()) {
      toast.error("Informe o motivo da regularização.");
      return;
    }
    setSavingRegularizacao(true);
    try {
      const { error } = await supabase.rpc('regularizar_faltas_paciente', {
        p_paciente_id: regularizarModal.paciente.paciente_id,
        p_motivo: motivoRegularizacao.trim(),
        p_liberar_todas: liberarTodas,
        p_profissional_id: regularizarModal.paciente.profissional_id
      });
      if (error) throw error;
      toast.success("Falta(s) regularizada(s) com sucesso!");
      setRegularizarModal({ open: false, paciente: null });
      setMotivoRegularizacao("");
      load();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao regularizar faltas.");
    } finally {
      setSavingRegularizacao(false);
    }
  };

  const handleRemoverBloqueio = async (p: PacienteFalta) => {
    if (!canUnblock) { toast.error("Sem permissão para desbloquear."); return; }
    setRegularizarModal({ open: true, paciente: p });
    setMotivoRegularizacao("");
    setLiberarTodas(false);
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
                    <TableHead>Profissional</TableHead>
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
                          {p.nome_paciente}
                          {p.is_tfd && <Badge variant="outline" className="text-[10px] py-0 h-4 border-warning text-warning">TFD</Badge>}
                          {p.possui_ordem_judicial && <Badge variant="outline" className="text-[10px] py-0 h-4 border-warning text-warning">JUDICIAL</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.nome_profissional}</TableCell>
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
              <p className="text-sm font-medium">{regularizarModal.paciente?.nome_paciente}</p>
              <p className="text-xs text-muted-foreground">Profissional: {regularizarModal.paciente?.nome_profissional}</p>
              <p className="text-xs text-muted-foreground">Faltas injustificadas: {regularizarModal.paciente?.total_faltas}</p>
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
