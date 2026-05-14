import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useProntuarioStructure } from '@/hooks/useProntuarioStructure';
import { useProntuarioTiposConfig } from '@/hooks/useProntuarioTiposConfig';
import { useProntuarioConfig } from '@/hooks/useProntuarioConfig';
import { useSoapCustomOptions } from '@/hooks/useSoapCustomOptions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Components
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { 
  History, FileText, User, Activity, ArrowLeft, Save, Printer, 
  Stethoscope, ClipboardList, Clock, Search, UserCog, Stamp, Trash2,
  Calendar, Info
} from 'lucide-react';

import PatientClinicalHeader from '@/components/pacientes/PatientClinicalHeader';
import { HistoricoClinico } from '@/components/HistoricoClinico';
import TriagemDetalhada from '@/components/TriagemDetalhada';
import DynamicProntuarioFields from '@/components/DynamicProntuarioFields';
import SoapFieldsAdaptive from '@/components/SoapFieldsAdaptive';
import PacienteDocumentos from '@/components/PacienteDocumentos';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuscaPaciente } from '@/components/BuscaPaciente';
import QuickEditPatientModal from '@/components/pacientes/QuickEditPatientModal';
import { BuscaProcedimento } from '@/components/BuscaProcedimento';
import { BuscaCID } from '@/components/BuscaCID';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { procedureService } from '@/services/procedureService';
import PrescricaoMedicamentos from '@/components/PrescricaoMedicamentos';
import SolicitacaoExames from '@/components/SolicitacaoExames';
import CamposEspecialidade from '@/components/CamposEspecialidade';
import ProntuarioAnexos from '@/components/ProntuarioAnexos';
import ResultadosExames from '@/components/ResultadosExames';
import HistoricoCompletoModal from '@/components/HistoricoCompletoModal';

const calcularIdade = (dataNasc: string): string => {
  if (!dataNasc) return "—";
  const nascimento = new Date(dataNasc + "T12:00:00");
  if (isNaN(nascimento.getTime())) return "—";
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  const m = hoje.getMonth() - nascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) anos--;
  return `${anos} ano(s)`;
};

const WorkspaceProntuario: React.FC = () => {
  const { user } = useAuth();
  const { pacientes, unidades } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pacienteId = searchParams.get('pacienteId');
  const pacienteNome = searchParams.get('pacienteNome');
  const agendamentoId = searchParams.get('agendamentoId');
  const editId = searchParams.get('editId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triagem, setTriagem] = useState<any>(null);
  const [pacienteData, setPacienteData] = useState<any>(null);
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Expanded clinical state
  const [procedimentos, setProcedimentos] = useState<any[]>([]);
  const [episodios, setEpisodios] = useState<any[]>([]);
  const [selectedProcIds, setSelectedProcIds] = useState<string[]>([]);
  const [cidsByProc, setCidsByProc] = useState<Record<string, any[]>>({});
  const [selectedCidsByProc, setSelectedCidsByProc] = useState<Record<string, string[]>>({});
  const [listaExames, setListaExames] = useState<any[]>([]);
  const [listaPrescricao, setListaPrescricao] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [profPreferences, setProfPreferences] = useState<any[]>([]);
  const [especialidadeFields, setEspecialidadeFields] = useState<Record<string, string>>({});
  const [sessaoCycle, setSessaoCycle] = useState<any>(null);
  const [sessaoPts, setSessaoPts] = useState<any>(null);
  const [sessaoDataLoading, setSessaoDataLoading] = useState(false);

  const [form, setForm] = useState<any>({
    tipo_registro: searchParams.get('tipo') === 'Retorno' ? 'retorno' : (searchParams.get('tipo') === 'Consulta' ? 'avaliacao_inicial' : (searchParams.get('tipo') || 'avaliacao_inicial')),
    data_atendimento: searchParams.get('data') || new Date().toISOString().split('T')[0],
    hora_atendimento: searchParams.get('horaInicio') || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    soap_subjetivo: '', soap_objetivo: '', soap_avaliacao: '', soap_plano: '',
    evolucao: '', queixa_principal: '', conduta: '',
    paciente_id: pacienteId || '',
    paciente_nome: pacienteNome || '',
    custom_data: {},
    agendamento_id: agendamentoId || '',
  });

  const { getCamposForTipo, soapLabels } = useProntuarioTiposConfig();
  const soapCustom = useSoapCustomOptions(user?.id);

  // Load procedures, medications and preferences
  useEffect(() => {
    if (!user?.id) return;
    const loadCommonData = async () => {
      try {
        const [procsList, medsRes, prefsRes] = await Promise.all([
          procedureService.getActive(),
          supabase.from("medications").select("*").or(`is_global.eq.true,profissional_id.eq.${user.id}`),
          supabase.from("professional_preferences").select("tipo,item_id,desabilitado").eq("profissional_id", user.id),
        ]);
        setProcedimentos(procsList as any[]);
        if (medsRes.data) setMedications(medsRes.data);
        if (prefsRes.data) setProfPreferences(prefsRes.data);
      } catch (err) { console.error("Error loading common data:", err); }
    };
    loadCommonData();
  }, [user?.id]);

  const loadSessaoData = async (patientId: string) => {
    setSessaoDataLoading(true);
    try {
      const [cycleRes, ptsRes] = await Promise.all([
        supabase.from('treatment_cycles').select('*').eq('patient_id', patientId).in('status', ['em_andamento', 'ativo']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('pts').select('*').eq('patient_id', patientId).eq('status', 'ativo').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setSessaoCycle(cycleRes.data);
      setSessaoPts(ptsRes.data);
    } catch (err) { console.error("Error loading session data:", err); }
    setSessaoDataLoading(false);
  };

  const loadProntuarioProcedimentos = async (prontId: string) => {
    const { data: prontProc } = await supabase.from("prontuario_procedimentos").select("*").eq("prontuario_id", prontId);
    if (prontProc && prontProc.length > 0) {
      setSelectedProcIds(prontProc.map((d: any) => d.procedimento_id));
      const cidsByProcMap: Record<string, any[]> = {};
      const selectedCidsMap: Record<string, string[]> = {};
      prontProc.forEach((d: any) => {
        try {
          const parsed = d.observacao ? JSON.parse(d.observacao) : null;
          const cids: any[] = Array.isArray(parsed?.cids) ? parsed.cids : [];
          if (cids.length > 0) {
            cidsByProcMap[d.procedimento_id] = cids;
            selectedCidsMap[d.procedimento_id] = cids.map((c: any) => c.codigo);
          }
        } catch { /* ignore */ }
      });
      setCidsByProc(prev => ({ ...prev, ...cidsByProcMap }));
      setSelectedCidsByProc(prev => ({ ...prev, ...selectedCidsMap }));
    }
  };

  const loadTriagem = async (agendamentoId: string) => {
    const { data } = await supabase.from("triage_records").select("*").eq("agendamento_id", agendamentoId).not("confirmado_em", "is", null).maybeSingle();
    if (data) setTriagem(data);
  };

  const loadEpisodios = async (pacienteId: string) => {
    const { data } = await supabase.from("episodios_clinicos").select("id,titulo,status").eq("paciente_id", pacienteId).eq("status", "ativo");
    if (data) setEpisodios(data);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const targetPacienteId = pacienteId || form.paciente_id;
        if (targetPacienteId) {
          const { data: pData } = await supabase.from('pacientes').select('*').eq('id', targetPacienteId).single();
          if (pData) setPacienteData(pData);
          loadSessaoData(targetPacienteId);
          loadEpisodios(targetPacienteId);

          if (agendamentoId) {
            loadTriagem(agendamentoId);
            const { data: p } = await supabase.from('prontuarios').select('*').eq('agendamento_id', agendamentoId).maybeSingle();
            if (p) {
              setForm(prev => ({ ...prev, ...p }));
              setEspecialidadeFields((p as any).campos_especialidade || {});
              loadProntuarioProcedimentos(p.id);
            }
          } else if (editId) {
            const { data: p } = await supabase.from('prontuarios').select('*').eq('id', editId).single();
            if (p) {
              setForm(prev => ({ ...prev, ...p }));
              setEspecialidadeFields((p as any).campos_especialidade || {});
              loadProntuarioProcedimentos(p.id);
              if (p.agendamento_id) loadTriagem(p.agendamento_id);
            }
          }
        }
      } finally { setLoading(false); }
    };
    loadData();
  }, [pacienteId, agendamentoId, editId, refreshTrigger]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dbPayload = {
        ...form,
        id: editId || form.id || undefined,
        profissional_id: user?.id,
        profissional_nome: user?.nome,
        unidade_id: user?.unidadeId || '',
        prescricao: JSON.stringify(listaPrescricao),
        solicitacao_exames: JSON.stringify(listaExames),
        campos_especialidade: especialidadeFields,
      };
      const { data, error } = await supabase.from('prontuarios').upsert(dbPayload).select().single();
      if (error) throw error;
      
      // Save procedures
      if (selectedProcIds.length > 0) {
        await supabase.from("prontuario_procedimentos").delete().eq("prontuario_id", data.id);
        const links = selectedProcIds.map(pid => {
          const proc = procedimentos.find(p => p.id === pid);
          const codigos = selectedCidsByProc[pid] || [];
          const cidsCatalogo = cidsByProc[pid] || [];
          const cidsPayload = codigos.map(c => ({ codigo: c, descricao: cidsCatalogo.find(cc => cc.codigo === c)?.descricao || '' }));
          return {
            prontuario_id: data.id,
            procedimento_id: pid,
            paciente_id: form.paciente_id,
            agendamento_id: form.agendamento_id || null,
            profissional_id: user?.id,
            unidade_id: user?.unidadeId,
            codigo_sigtap: proc?.id || pid,
            nome_procedimento: proc?.nome || 'Procedimento',
            especialidade: proc?.especialidade || '',
            quantidade: 1,
            cid: codigos[0] || null,
            observacao: cidsPayload.length > 0 ? JSON.stringify({ cids: cidsPayload }) : '',
          };
        });
        await supabase.from("prontuario_procedimentos").insert(links);
      }

      toast.success('Prontuário salvo com sucesso!');
      if (!editId) navigate(`/painel/workspace-prontuario?pacienteId=${pacienteId || form.paciente_id}&editId=${data.id}`, { replace: true });
    } catch (e) { console.error(e); toast.error('Erro ao salvar prontuário'); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="flex items-center justify-between px-6 py-2.5 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button>
          <div className="flex items-center gap-2">
             <h1 className="text-sm font-bold">Workspace Clínico</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"><Printer className="w-4 h-4 mr-2" /> Imprimir</Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gradient-primary">{saving ? 'Salvando...' : 'Finalizar'}</Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={70}>
            <ScrollArea className="h-full p-6">
              <div className="max-w-4xl mx-auto space-y-6">
                <PatientClinicalHeader
                  onEdit={() => setEditPatientOpen(true)}
                  nome={pacienteData?.nome || pacienteNome || 'Paciente'}
                  idade={pacienteData?.data_nascimento ? calcularIdade(pacienteData.data_nascimento) : '—'}
                  sexo={pacienteData?.sexo || '—'}
                  cpf={pacienteData?.cpf || '—'}
                  cns={pacienteData?.cns || '—'}
                  profissional={user?.nome || '—'}
                  telefone={pacienteData?.telefone}
                  email={pacienteData?.email}
                  endereco={pacienteData?.endereco}
                />

                {(!pacienteId && !editId) && (
                  <Card className="p-4 space-y-4">
                    <Label>Identificar Paciente</Label>
                    <BuscaPaciente pacientes={pacientes} value={form.paciente_id} onChange={(id, nome) => setForm(p => ({...p, paciente_id: id, paciente_nome: nome}))} />
                  </Card>
                )}

                <Tabs defaultValue="evolution" className="w-full">
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-2 border-b mb-4">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <TabsList className="flex-1 justify-start h-12 bg-transparent gap-6 p-0 overflow-x-auto">
                        <TabsTrigger value="evolution" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold">Evolução</TabsTrigger>
                        <TabsTrigger value="prescriptions" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Prescrições/Exames</TabsTrigger>
                        <TabsTrigger value="procedures" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Procedimentos/CID</TabsTrigger>
                        <TabsTrigger value="treatments" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Tratamentos/PTS</TabsTrigger>
                        <TabsTrigger value="antecedents" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Histórico Externo</TabsTrigger>
                        <TabsTrigger value="annexes" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap">Anexos</TabsTrigger>
                      </TabsList>

                      <div className="flex items-center gap-2 shrink-0">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground whitespace-nowrap">Tipo de Registro:</Label>
                        <Select 
                          value={form.tipo_registro} 
                          onValueChange={(v) => setForm(p => ({...p, tipo_registro: v}))}
                        >
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="avaliacao_inicial">Avaliação Inicial</SelectItem>
                            <SelectItem value="retorno">Retorno</SelectItem>
                            <SelectItem value="sessao">Sessão</SelectItem>
                            <SelectItem value="urgencia">Urgência</SelectItem>
                            <SelectItem value="procedimento">Procedimento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <TabsContent value="evolution" className="mt-0 space-y-6">
                    <SoapFieldsAdaptive
                      profissao={user?.profissao}
                      values={{
                        soap_subjetivo: form.soap_subjetivo || '',
                        soap_objetivo: form.soap_objetivo || '',
                        soap_avaliacao: form.soap_avaliacao || '',
                        soap_plano: form.soap_plano || '',
                      }}
                      onChange={(field, value) => setForm(prev => ({ ...prev, [field]: value }))}
                      soapErrors={false}
                      onClearErrors={() => {}}
                      soapEnabled={true}
                      onToggleSoap={() => {}}
                      labels={soapLabels}
                      customOptionsForField={(field) => soapCustom.getOptionsForField(field)}
                      customOptionsWithId={(field) => soapCustom.getOptionWithId(field)}
                      onAddCustomOption={(field, option) => soapCustom.addOption(field, option, user?.profissao || '')}
                      onDeleteCustomOption={soapCustom.deleteOption}
                    />
                    <DynamicProntuarioFields
                      campos={getCamposForTipo(form.tipo_registro)}
                      formValues={form}
                      customValues={form.custom_data || {}}
                      onFormChange={(k, v) => setForm(p => ({...p, [k]: v}))}
                      onCustomChange={(k, v) => setForm(p => ({...p, custom_data: {...p.custom_data, [k]: v}}))}
                      especialidadeFields={especialidadeFields}
                      onEspecialidadeChange={(k, v) => setEspecialidadeFields(p => ({...p, [k]: v}))}
                      profissao={user?.profissao}
                      profissionalId={user?.id}
                      tipoProntuario={form.tipo_registro === 'avaliacao_inicial' ? 'avaliacao' : (form.tipo_registro === 'retorno' ? 'retorno' : (form.tipo_registro === 'sessao' ? 'sessao' : (form.tipo_registro === 'urgencia' ? 'urgencia' : (form.tipo_registro === 'procedimento' ? 'procedimento' : 'avaliacao'))))}
                    />
                  </TabsContent>

                  <TabsContent value="prescriptions" className="mt-0 space-y-6">
                    <PrescricaoMedicamentos
                      profissionalId={user?.id || ''}
                      value={listaPrescricao}
                      onChange={setListaPrescricao}
                    />
                    <SolicitacaoExames
                      profissionalId={user?.id || ''}
                      value={listaExames}
                      onChange={setListaExames}
                    />
                  </TabsContent>

                  <TabsContent value="procedures" className="mt-0 space-y-6">
                    <Card>
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          <Label>Procedimentos Realizados / CID-10</Label>
                          <BuscaProcedimento 
                            profissao={user?.profissao}
                            onChange={(proc) => {
                              if (proc && !selectedProcIds.includes(proc.id)) {
                                setSelectedProcIds(prev => [...prev, proc.id]);
                                procedureService.getCidsForProcedure(proc.id).then(list => {
                                  setCidsByProc(prev => ({ ...prev, [proc.id]: list }));
                                });
                              }
                            }}
                          />
                          <div className="space-y-3 mt-4">
                            {selectedProcIds.map(pid => {
                              const proc = procedimentos.find(p => p.id === pid);
                              return (
                                <div key={pid} className="p-3 border rounded-lg bg-muted/20">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-sm">{proc?.nome || pid}</span>
                                      <span className="text-[10px] font-mono text-muted-foreground">Código: {proc?.id || pid}</span>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedProcIds(prev => prev.filter(i => i !== pid))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                  </div>
                                  <div className="mb-3">
                                    <BuscaCID 
                                      placeholder="Adicionar CID relacionado..."
                                      onSelect={(cid) => {
                                        const current = selectedCidsByProc[pid] || [];
                                        if (!current.includes(cid.codigo)) {
                                          setSelectedCidsByProc(prev => ({ ...prev, [pid]: [...current, cid.codigo] }));
                                          setCidsByProc(prev => {
                                            const existing = prev[pid] || [];
                                            if (!existing.some(x => x.codigo === cid.codigo)) {
                                              return { ...prev, [pid]: [...existing, cid] };
                                            }
                                            return prev;
                                          });
                                        }
                                      }} 
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {(cidsByProc[pid] || []).map(cid => (
                                      <Badge 
                                        key={cid.codigo} 
                                        variant={selectedCidsByProc[pid]?.includes(cid.codigo) ? "default" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => {
                                          const current = selectedCidsByProc[pid] || [];
                                          if (current.includes(cid.codigo)) {
                                            setSelectedCidsByProc(prev => ({ ...prev, [pid]: current.filter(c => c !== cid.codigo) }));
                                          } else {
                                            setSelectedCidsByProc(prev => ({ ...prev, [pid]: [...current, cid.codigo] }));
                                          }
                                        }}
                                      >
                                        {cid.codigo} - {cid.descricao}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="treatments" className="mt-0 space-y-6">
                    {sessaoCycle ? (
                      <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <Activity className="w-5 h-5 text-primary" />
                            <div>
                              <p className="font-bold text-sm">Tratamento em Andamento: {sessaoCycle.treatment_type}</p>
                              <p className="text-xs text-muted-foreground">Início: {new Date(sessaoCycle.start_date).toLocaleDateString()} | Sessões: {sessaoCycle.sessions_done}/{sessaoCycle.total_sessions}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="p-8 text-center border-2 border-dashed rounded-xl">
                        <p className="text-muted-foreground mb-4">Nenhum ciclo de tratamento ativo para este paciente.</p>
                        <Button variant="outline" size="sm">Iniciar Novo Ciclo</Button>
                      </div>
                    )}
                    
                    {sessaoPts ? (
                      <Card>
                        <CardContent className="p-4">
                          <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                            <ClipboardList className="w-4 h-4" /> Projeto Terapêutico Singular (PTS)
                          </h4>
                          <div className="space-y-2">
                            <div className="text-xs bg-muted p-2 rounded"><strong>Diagnóstico:</strong> {sessaoPts.diagnostico_funcional}</div>
                            <div className="text-xs bg-muted p-2 rounded"><strong>Objetivos:</strong> {sessaoPts.objetivos_terapeuticos}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="p-8 text-center border-2 border-dashed rounded-xl">
                        <p className="text-muted-foreground mb-4">Nenhum PTS ativo para este paciente.</p>
                        <Button variant="outline" size="sm">Criar PTS</Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="antecedents" className="mt-0 space-y-6">
                    <TriagemDetalhada 
                      triagem={triagem} 
                    />
                    <CamposEspecialidade 
                      profissao={user?.profissao} 
                      values={especialidadeFields} 
                      onChange={(k, v) => setEspecialidadeFields(p => ({...p, [k]: v}))} 
                      profissionalId={user?.id}
                      tipoProntuario={form.tipo_registro === 'avaliacao_inicial' ? 'avaliacao' : form.tipo_registro as any}
                    />
                  </TabsContent>

                  <TabsContent value="annexes" className="mt-0 space-y-6">
                    <ProntuarioAnexos 
                      pacienteId={pacienteId || form.paciente_id} 
                      tipoRegistro={form.tipo_registro}
                    />
                    <ResultadosExames pacienteId={pacienteId || form.paciente_id} />
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={35} minSize={25}>
            <Tabs defaultValue="history" className="flex flex-col h-full">
              <div className="px-4 py-2 border-b bg-muted/30">
                <TabsList className="w-full h-9 bg-transparent p-0 gap-4">
                  <TabsTrigger value="history" className="flex-1 h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-xs font-bold uppercase tracking-wider">Histórico Longitudinal</TabsTrigger>
                  <TabsTrigger value="files" className="flex-1 h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-xs font-bold uppercase tracking-wider">Documentos</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="history" className="flex-1 min-h-0 mt-0">
                 {(pacienteId || form.paciente_id) && (
                   <HistoricoClinico 
                     pacienteId={pacienteId || form.paciente_id} 
                     pacienteNome={pacienteNome || form.paciente_nome || ''} 
                     unidades={unidades}
                     currentProfissionalId={user?.id}
                   />
                 )}
              </TabsContent>
              <TabsContent value="files" className="flex-1 min-h-0 mt-0 overflow-y-auto p-4">
                <PacienteDocumentos pacienteId={pacienteId || form.paciente_id} />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <QuickEditPatientModal
        open={editPatientOpen}
        onOpenChange={setEditPatientOpen}
        pacienteId={pacienteId || form.paciente_id}
        onSaved={async () => { 
          const { data: pData } = await supabase.from('pacientes').select('*').eq('id', pacienteId || form.paciente_id).single();
          if (pData) setPacienteData(pData);
          setRefreshTrigger(r => r + 1); 
          setEditPatientOpen(false); 
        }}
      />
    </div>
  );
};

export default WorkspaceProntuario;
