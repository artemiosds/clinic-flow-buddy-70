import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, ClipboardList, Plus, Play, CheckCircle, 
  Loader2, Copy, ChevronRight, Calendar, Info, 
  AlertTriangle, RotateCcw, X, Pencil, Eraser, ListOrdered, Link2, Unlink, User, Trash2
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { normalizeSoapPayload, treatmentService } from '@/services/treatmentService';
import { getSoapOptions, hasDropdownSoap } from '@/data/soapOptionsByProfession';
import { useSoapCustomOptions } from '@/hooks/useSoapCustomOptions';
import { ModalAgendarSessao } from '@/components/ModalAgendarSessao';
import { ResumoAgendamentoCiclo, type ResumoSessaoItem } from '@/components/ResumoAgendamentoCiclo';

interface Props {
  pacienteId: string;
  pacienteNome: string;
  onCycleCreated?: () => void;
  onPtsCreated?: () => void;
}

const statusColors: Record<string, string> = {
  em_andamento: "bg-success/15 text-success border-success/30",
  concluido: "bg-success/10 text-success border-success/30",
  aguardando_vaga: "bg-warning/15 text-warning border-warning/30",
  em_fila: "bg-info/15 text-info border-info/30",
  finalizado_alta: "bg-muted text-muted-foreground border-border",
  suspenso: "bg-destructive/15 text-destructive border-destructive/30",
  em_reavaliacao: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

const statusLabels: Record<string, string> = {
  em_andamento: "Em Andamento",
  concluido: "Concluido",
  aguardando_vaga: "Aguardando Vaga",
  em_fila: "Em Fila",
  finalizado_alta: "Finalizado (Alta)",
  suspenso: "Suspenso",
  em_reavaliacao: "Em Reavaliação",
};

const sessionStatusColors: Record<string, string> = {
  pendente_agendamento: "bg-warning/10 text-warning",
  agendada: "bg-info/10 text-info",
  realizada: "bg-success/10 text-success",
  paciente_faltou: "bg-destructive/10 text-destructive",
  falta_justificada: "bg-info/10 text-info border-info/30",
  falta_regularizada: "bg-success/10 text-success border-success/30",
  cancelada: "bg-muted text-muted-foreground",
  remarcada: "bg-warning/10 text-warning",
};

const sessionStatusLabels: Record<string, string> = {
  pendente_agendamento: "Ag. Agendamento",
  agendada: "Agendada",
  realizada: "Realizada",
  paciente_faltou: "Faltou",
  falta_justificada: "Falta Justificada",
  falta_regularizada: "Falta Regularizada",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

export const TreatmentTab: React.FC<Props> = ({ pacienteId, pacienteNome, onCycleCreated, onPtsCreated }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { funcionarios, unidades, salas, addAgendamento, deleteAgendamento, logAction, getAvailableSlots, getAvailableDates } = useData();
  const { can } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activePts, setActivePts] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [agendamentoMap, setAgendamentoMap] = useState<Record<string, any>>({});
  const [resumoCiclo, setResumoCiclo] = useState<ResumoSessaoItem[] | null>(null);

  // Modals state
  const [selectSessionOpen, setSelectSessionOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [selectedSessionForRegister, setSelectedSessionForRegister] = useState<any>(null);
  const [registeringSession, setRegisteringSession] = useState(false);
  const [soapNotes, setSoapNotes] = useState({ subjetivo: "", objetivo: "", avaliacao: "", plano: "" });
  const [newSession, setNewSession] = useState({ clinical_notes: "", procedure_done: "", status: "realizada", absence_type: "" });
  
  const [agendarSessaoTarget, setAgendarSessaoTarget] = useState<any>(null);
  const [remarcarTarget, setRemarcarTarget] = useState<any>(null);
  
  const canManageFull = can('gestao_tratamentos', 'can_delete');
  const isProfissional = user?.role === "profissional";
  const canAgendarSessao = can('gestao_tratamentos', 'can_execute');
  const canControlSessions = isProfissional || user?.role === 'master';

  const loadData = useCallback(async () => {
    if (!pacienteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cycleRes, ptsRes] = await Promise.all([
        supabase.from('treatment_cycles').select('*').eq('patient_id', pacienteId).in('status', ['em_andamento', 'ativo']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('pts').select('*').eq('patient_id', pacienteId).eq('status', 'ativo').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (cycleRes.error) throw cycleRes.error;
      if (ptsRes.error) throw ptsRes.error;

      setActiveCycle(cycleRes.data);
      setActivePts(ptsRes.data);

      if (cycleRes.data) {
        const [sessRes, agRes] = await Promise.all([
          supabase.from('treatment_sessions').select('*').eq('cycle_id', cycleRes.data.id).order('session_number', { ascending: true }),
          supabase.from('agendamentos').select('id, data, hora, status, paciente_id, profissional_id, falta_justificada, regularizada').eq('paciente_id', pacienteId).not('status', 'eq', 'cancelado'),
        ]);

        if (sessRes.error) throw sessRes.error;
        if (agRes.error) throw agRes.error;

        setSessions(sessRes.data || []);
        
        const agMap: Record<string, any> = {};
        (agRes.data || []).forEach(ag => {
          const key = `${ag.paciente_id}|${ag.profissional_id}|${ag.data}`;
          agMap[key] = ag;
          agMap[ag.id] = ag;
        });
        setAgendamentoMap(agMap);
      } else {
        setSessions([]);
        setAgendamentoMap({});
      }
    } catch (err: any) {
      console.error('Error loading treatment data:', err);
      toast.error("Erro ao carregar dados de tratamento: " + (err.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cycleProfissao = useMemo(() => {
    if (!activeCycle) return undefined;
    const prof = funcionarios.find((p: any) => p.id === activeCycle.professional_id);
    return prof?.profissao;
  }, [activeCycle, funcionarios]);

  const cycleSoapOptions = useMemo(() => getSoapOptions(cycleProfissao), [cycleProfissao]);
  const cycleHasDropdown = useMemo(() => hasDropdownSoap(cycleProfissao), [cycleProfissao]);
  const soapCustom = useSoapCustomOptions(activeCycle?.professional_id);

  const handleRegisterSession = async () => {
    if (!activeCycle || !selectedSessionForRegister) return;
    setRegisteringSession(true);
    try {
      if (newSession.status === "realizada") {
        const soapPayload = normalizeSoapPayload(soapNotes);
        await treatmentService.registerCompletedSession({
          cycle: activeCycle,
          session: selectedSessionForRegister,
          soap: soapPayload,
          procedureDone: newSession.procedure_done,
          userId: user?.id,
          appointmentId: selectedSessionForRegister.appointment_id,
        });
      } else {
        await supabase.from("treatment_sessions").update({
          status: newSession.status,
          clinical_notes: newSession.clinical_notes,
          procedure_done: newSession.procedure_done,
          absence_type: newSession.status === "paciente_faltou" ? newSession.absence_type : null,
        }).eq("id", selectedSessionForRegister.id);
      }

      await logAction({
        acao: "registrar_sessao",
        entidade: "treatment_session",
        entidadeId: selectedSessionForRegister.id,
        modulo: "tratamentos",
        user,
        detalhes: { ciclo: activeCycle.id, sessao: selectedSessionForRegister.session_number, status: newSession.status },
      });

      toast.success("Sessão registrada com sucesso!");
      setSessionOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar sessão.");
    } finally {
      setRegisteringSession(false);
    }
  };

  const handleDeletePts = async () => {
    if (!activePts) return;
    if (!window.confirm("Deseja realmente excluir este Projeto Terapêutico Singular (PTS)?")) return;

    try {
      const { error } = await supabase.from('pts').delete().eq('id', activePts.id);
      if (error) throw error;

      await logAction({
        acao: 'excluir_pts',
        entidade: 'pts',
        entidadeId: activePts.id,
        modulo: 'tratamentos',
        user,
        detalhes: { paciente_id: pacienteId, paciente_nome: pacienteNome },
      });

      toast.success("PTS excluído com sucesso!");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir PTS.");
    }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;


  if (!pacienteId) {
    return (
      <div className="p-8 text-center border-2 border-dashed rounded-2xl bg-muted/20">
        <User className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="font-bold text-foreground text-sm uppercase tracking-tight">Paciente não identificado</h3>
        <p className="text-xs text-muted-foreground mt-1">Selecione um paciente para visualizar os tratamentos e PTS.</p>
      </div>
    );
  }

  const progressPct = activeCycle ? Math.round((activeCycle.sessions_done / activeCycle.total_sessions) * 100) : 0;
  const salasDisponiveis = activeCycle ? (salas || []).filter((s: any) => s.unidadeId === activeCycle.unit_id && s.ativo) : [];

  return (
    <div className="space-y-6">
      {activeCycle ? (
        <Card className="border-0 shadow-sm ring-1 ring-border/50">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">{activeCycle.treatment_type}</h3>
                  <p className="text-xs text-muted-foreground">{activeCycle.specialty} • Início: {new Date(activeCycle.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              <Badge className={cn("border", statusColors[activeCycle.status])}>{statusLabels[activeCycle.status]}</Badge>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span>Progresso do Tratamento</span>
                <span>{activeCycle.sessions_done}/{activeCycle.total_sessions} sessões ({progressPct}%)</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="h-8" onClick={() => setSelectSessionOpen(true)} disabled={activeCycle.status === 'concluido'}>
                <Play className="w-3.5 h-3.5 mr-1.5" /> Registrar Sessão
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={async () => {
                const { data: sess } = await supabase.from('treatment_sessions').select('*').eq('cycle_id', activeCycle.id).order('session_number', { ascending: false }).limit(1).maybeSingle();
                const nextNum = (sess?.session_number || 0) + 1;
                const newTotal = (activeCycle.total_sessions || 0) + 1;
                const today = new Date().toISOString().split('T')[0];
                
                await Promise.all([
                  supabase.from('treatment_sessions').insert({
                    cycle_id: activeCycle.id, patient_id: pacienteId, professional_id: activeCycle.professional_id,
                    session_number: nextNum, total_sessions: newTotal, scheduled_date: today, status: 'pendente_agendamento'
                  }),
                  supabase.from('treatment_cycles').update({ total_sessions: newTotal }).eq('id', activeCycle.id)
                ]);
                toast.success("Sessão extra adicionada!");
                loadData();
              }}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Sessão Extra
              </Button>
              {canManageFull && (
                 <Button size="sm" variant="outline" className="h-8 border-destructive text-destructive hover:bg-destructive/5" onClick={async () => {
                   if (window.confirm("Deseja realmente suspender este tratamento?")) {
                     await supabase.from('treatment_cycles').update({ status: 'suspenso' }).eq('id', activeCycle.id);
                     loadData();
                   }
                 }}>
                   Suspender
                 </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="p-8 text-center border-2 border-dashed rounded-2xl bg-muted/20">
          <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-bold text-foreground">Sem Ciclo de Tratamento</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Este paciente não possui um plano de tratamento ativo no momento.</p>
          <Button variant="outline" size="sm" onClick={() => onCycleCreated?.()}>Iniciar Novo Ciclo</Button>
        </div>
      )}

      {activePts ? (
        <Card className="border-0 shadow-sm ring-1 ring-border/50 border-l-4 border-l-purple-500">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="font-bold text-foreground">Projeto Terapêutico Singular (PTS)</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Ativo</Badge>
                {canManageFull && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" 
                    onClick={handleDeletePts}
                    title="Excluir PTS"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>


            <div className="grid gap-4">
              <div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5">Diagnóstico Funcional</p>
                <div className="p-3 bg-muted/40 rounded-lg text-sm leading-relaxed border border-border/50">{activePts.diagnostico_funcional}</div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5">Objetivos Terapêuticos</p>
                <div className="p-3 bg-muted/40 rounded-lg text-sm leading-relaxed border border-border/50">{activePts.objetivos_terapeuticos}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  <p className="text-[9px] font-black uppercase text-blue-600 tracking-widest mb-1">📌 Curto Prazo</p>
                  <p className="text-xs">{activePts.metas_curto_prazo || '—'}</p>
                </div>
                <div className="p-3 bg-orange-50/50 rounded-lg border border-orange-100">
                  <p className="text-[9px] font-black uppercase text-orange-600 tracking-widest mb-1">📋 Médio Prazo</p>
                  <p className="text-xs">{activePts.metas_medio_prazo || '—'}</p>
                </div>
                <div className="p-3 bg-green-50/50 rounded-lg border border-green-100">
                  <p className="text-[9px] font-black uppercase text-green-600 tracking-widest mb-1">🎯 Longo Prazo</p>
                  <p className="text-xs">{activePts.metas_longo_prazo || '—'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="p-8 text-center border-2 border-dashed rounded-2xl bg-muted/20">
          <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-bold text-foreground">Sem PTS Vinculado</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Vincule um Projeto Terapêutico Singular para acompanhar metas específicas.</p>
          <Button variant="outline" size="sm" onClick={() => onPtsCreated?.()}>Criar PTS</Button>
        </div>
      )}

      {activeCycle && (
        <Card className="border-0 shadow-sm ring-1 ring-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Sessões do Ciclo
              </h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs font-bold uppercase text-primary hover:bg-primary/5" 
                onClick={() => navigate('/painel/tratamentos')}
              >
                Ver Grade Completa
              </Button>
            </div>
            
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {sessions.map((s) => {
                const agKey = `${s.patient_id}|${s.professional_id}|${s.scheduled_date}`;
                const matchedAg = (s.appointment_id ? agendamentoMap[s.appointment_id] : null) || agendamentoMap[agKey];
                let effectiveStatus = (s.status === "pendente_agendamento" && matchedAg) ? "agendada" : s.status;
                
                return (
                  <div key={s.id} className={cn("group flex items-center justify-between p-3 rounded-xl border transition-all", s.status === 'realizada' ? 'bg-muted/10 border-border/40 opacity-70' : 'bg-card border-border hover:border-primary/30 hover:shadow-sm')}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-mono font-bold text-muted-foreground shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {s.session_number}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                          {matchedAg?.hora ? `Agendada: ${matchedAg.hora.slice(0,5)}` : (s.status === 'pendente_agendamento' ? 'Aguardando agendamento' : '')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-[10px] font-black uppercase tracking-widest px-1.5 h-5", sessionStatusColors[effectiveStatus])}>
                        {sessionStatusLabels[effectiveStatus]}
                      </Badge>
                      {effectiveStatus === 'pendente_agendamento' && canAgendarSessao && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-primary hover:bg-primary/10" onClick={() => setAgendarSessaoTarget(s)}>
                          <Calendar className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Register Session Dialog */}
      <Dialog open={selectSessionOpen} onOpenChange={setSelectSessionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Sessão</DialogTitle></DialogHeader>
          <div className="space-y-2 py-4">
             {sessions.filter(s => ['agendada', 'pendente_agendamento'].includes(s.status)).map(s => (
               <button key={s.id} className="w-full text-left p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-between" onClick={() => {
                 setSelectedSessionForRegister(s);
                 setSelectSessionOpen(false);
                 setSessionOpen(true);
               }}>
                 <div>
                   <p className="font-bold text-sm">Sessão {s.session_number}</p>
                   <p className="text-xs text-muted-foreground">{new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                 </div>
                 <ChevronRight className="w-4 h-4 text-muted-foreground" />
               </button>
             ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sessão {selectedSessionForRegister?.session_number}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status do Atendimento</Label>
              <Select value={newSession.status} onValueChange={(v) => setNewSession(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-11 font-semibold rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realizada">Realizada</SelectItem>
                  <SelectItem value="paciente_faltou">Paciente Faltou</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newSession.status === 'realizada' && (
              <div className="space-y-4 border-t pt-4 mt-2">
                 <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Evolução SOAP</Label>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-bold text-primary" onClick={async () => {
                       const { data } = await supabase.from('treatment_sessions').select('clinical_notes').eq('cycle_id', activeCycle.id).eq('status', 'realizada').order('session_number', { ascending: false }).limit(1);
                       if (data?.[0]?.clinical_notes) {
                         const p = JSON.parse(data[0].clinical_notes);
                         setSoapNotes({ subjetivo: p.subjetivo || '', objetivo: p.objetivo || '', avaliacao: p.avaliacao || '', plano: p.plano || '' });
                         toast.success("Copiado da sessão anterior!");
                       }
                    }}><Copy className="w-3 h-3 mr-1" /> Copiar Anterior</Button>
                 </div>
                 
                 <div className="grid gap-3">
                    {['subjetivo', 'objetivo', 'avaliacao', 'plano'].map((k) => (
                      <div key={k} className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground/70">{k.charAt(0)} — {k}</Label>
                        <Textarea 
                          value={(soapNotes as any)[k]} 
                          onChange={e => setSoapNotes(p => ({...p, [k]: e.target.value}))}
                          className="min-h-[80px] bg-muted/20 border-border/60 rounded-xl text-sm focus:ring-primary/20"
                          placeholder={`Descreva aqui o ${k}...`}
                        />
                      </div>
                    ))}
                 </div>
              </div>
            )}

            {newSession.status === 'paciente_faltou' && (
              <div className="space-y-2 border-t pt-4">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Tipo de Falta</Label>
                <Select value={newSession.absence_type} onValueChange={v => setNewSession(p => ({...p, absence_type: v}))}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="justificada">Justificada</SelectItem>
                    <SelectItem value="injustificada">Injustificada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={handleRegisterSession} disabled={registeringSession} className="w-full h-11 gradient-primary rounded-xl font-bold mt-4 shadow-lg shadow-primary/20">
              {registeringSession ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
              Finalizar Registro
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ModalAgendarSessao
        open={!!agendarSessaoTarget}
        onClose={() => setAgendarSessaoTarget(null)}
        session={agendarSessaoTarget}
        cycle={activeCycle}
        pacienteNome={pacienteNome}
        profissionalNome={funcionarios.find(f => f.id === activeCycle?.professional_id)?.nome || ''}
        salas={salasDisponiveis}
        availableDates={activeCycle ? getAvailableDates(activeCycle.professional_id, activeCycle.unit_id) : []}
        getAvailableSlots={getAvailableSlots}
        onConfirm={async (data, hora, salaId) => {
          const agId = `ag${Date.now()}`;
          await addAgendamento({
            id: agId,
            pacienteId,
            pacienteNome,
            unidadeId: activeCycle.unit_id,
            salaId: salaId || "",
            profissionalId: activeCycle.professional_id,
            profissionalNome: funcionarios.find((f: any) => f.id === activeCycle.professional_id)?.nome || '',
            data,
            hora,
            status: "confirmado",
            tipo: "Sessão de Tratamento",
            observacoes: `Sessão ${agendarSessaoTarget.session_number} — ${activeCycle.treatment_type}`,
            origem: "recepcao",
            criadoEm: new Date().toISOString(),
            criadoPor: user?.id || "",
          } as any);
          await supabase.from("treatment_sessions").update({ appointment_id: agId, status: "agendada", scheduled_date: data }).eq("id", agendarSessaoTarget.id);
          toast.success("Sessão agendada!");
          loadData();
        }}
      />
    </div>
  );
};
