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
}

const Faltosos: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const { unidadeId } = useUnidadeFilter();
  const [list, setList] = useState<PacienteFalta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [periodoDias, setPeriodoDias] = useState<string>("0");

  const allowedRoles = ["master", "gestor", "coordenador", "recepcao"];
  const canAccess = isGlobalAdmin || (user && allowedRoles.includes(user.role));
  const canUnblock = isGlobalAdmin || (user && ["master", "gestor"].includes(user.role));

  const load = async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from("pacientes")
        .select("id, nome, cpf, telefone, total_faltas, faltas_consecutivas, status_falta, unidade_id")
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
        description="Controle de faltas, alertas e bloqueios automáticos por excesso de faltas."
        icon={AlertTriangle}
      />

      <Card className="shadow-card border-0">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
            <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="FALTOSO">Apenas FALTOSO</SelectItem>
                <SelectItem value="BLOQUEADO">Apenas BLOQUEADO</SelectItem>
              </SelectContent>
            </Select>
            <Select value={periodoDias} onValueChange={setPeriodoDias}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Qualquer período</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
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
                        <div className="font-medium text-sm">{p.nome}</div>
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
                          <Button size="sm" variant="outline" onClick={() => handleRemoverBloqueio(p)}>
                            Remover bloqueio
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
    </div>
  );
};

export default Faltosos;
