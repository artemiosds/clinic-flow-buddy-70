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
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

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
  Calendar, Info, AlertTriangle, FileDown, Users
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { TIPO_REGISTRO_LABELS } from '@/utils/labels';

import PatientClinicalHeader from '@/components/pacientes/PatientClinicalHeader';
import { HistoricoClinico } from '@/components/HistoricoClinico';
import TriagemDetalhada from '@/components/TriagemDetalhada';
import { AcolhimentoView } from '@/components/prontuario/AcolhimentoView';
import DynamicProntuarioFields from '@/components/DynamicProntuarioFields';
import SoapFieldsAdaptive from '@/components/SoapFieldsAdaptive';
import PacienteDocumentos from '@/components/PacienteDocumentos';
import { AcolhimentoForm } from '@/components/prontuario/AcolhimentoForm';
import { GroupActivityForm } from '@/components/prontuario/GroupActivityForm';
import { CreatePTSModal } from '@/components/prontuario/CreatePTSModal';
import { CreateCycleModal } from '@/components/prontuario/CreateCycleModal';
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
import { TreatmentTab } from '@/components/prontuario/TreatmentTab';
import { openPrintDocument } from '@/lib/printLayout';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';

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
  const { pacientes, unidades, updateAgendamento } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pacienteId = searchParams.get('pacienteId');
  const pacienteNome = searchParams.get('pacienteNome');
  const agendamentoId = searchParams.get('agendamentoId');
  const editId = searchParams.get('editId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveAttemptedRef = useRef(false);
  const [triagem, setTriagem] = useState<any>(null);
  const [pacienteData, setPacienteData] = useState<any>(null);
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('tab_evolution');
  const [form, setForm] = useState<any>({
    tipo_registro: searchParams.get('tipo') === 'Retorno' ? 'retorno' : (searchParams.get('tipo') === 'Consulta' || searchParams.get('tipo') === 'Avaliação/TR' ? 'avaliacao_inicial' : (searchParams.get('tipo') || 'avaliacao_inicial')),
    data_atendimento: searchParams.get('data') || new Date().toISOString().split('T')[0],
    hora_atendimento: searchParams.get('horaInicio') || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    soap_subjetivo: '', soap_objetivo: '', soap_avaliacao: '', soap_plano: '',
    evolucao: '', queixa_principal: '', conduta: '',
    anamnese: '', sinais_sintomas: '', exame_fisico: '', hipotese: '',
    observacoes: '', indicacao_retorno: '', motivo_alteracao: '',
    procedimentos_texto: '', outro_procedimento: '', episodio_id: '',
    paciente_id: pacienteId || '',
    paciente_nome: pacienteNome || '',
    custom_data: {},
    agendamento_id: agendamentoId || '',
    prescricao: '',
    solicitacao_exames: '',
  });

  const { sections: prontuarioSections, loading: structureLoading } = useProntuarioStructure();
  
  useEffect(() => {
    if (prontuarioSections && prontuarioSections.length > 0 && !prontuarioSections.find(s => s.id === activeTab)) {
        const first = prontuarioSections.find(s => s.enabled && (s.tiposProntuario || []).includes(form.tipo_registro));
        if (first) setActiveTab(first.standardTabId || first.id);
    }
  }, [prontuarioSections, form.tipo_registro]);

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
  const [createPtsOpen, setCreatePtsOpen] = useState(false);
  const [createCycleOpen, setCreateCycleOpen] = useState(false);
  const [acolhimentoData, setAcolhimentoData] = useState<any>(null);
  const [acolhimentoDraft, setAcolhimentoDraft] = useState<any>({});
  const [loadingAcolhimento, setLoadingAcolhimento] = useState(false);
  const [savingAcolhimento, setSavingAcolhimento] = useState(false);
  const [hasModifiedForm, setHasModifiedForm] = useState(false);
  const [groupActivityData, setGroupActivityData] = useState<any>(null);
  const [groupActivityDraft, setGroupActivityDraft] = useState<any>({ tema: '', tipo_atividade: '', evolucao: '' });
  const [loadingGroupActivity, setLoadingGroupActivity] = useState(false);
  const [savingGroupActivity, setSavingGroupActivity] = useState(false);

  const handleFormChange = (updates: any) => {
    setForm((prev: any) => {
      const next = { ...prev, ...updates };
      if (updates.custom_data) {
        next.custom_data = { ...prev.custom_data, ...updates.custom_data };
      }
      return next;
    });
    setHasModifiedForm(true);
  };

  const [soapEnabled, setSoapEnabled] = useState(true);

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

  const loadAcolhimento = async (patientId: string) => {
    setLoadingAcolhimento(true);
    try {
      const { data } = await supabase
        .from('prontuarios')
        .select('*')
        .eq('paciente_id', patientId)
        .eq('tipo_registro', 'acolhimento_mental')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const typedData = data as any;
      if (typedData) {
        setAcolhimentoData(typedData);
        if (typedData.dados_acolhimento) {
          setAcolhimentoDraft(typedData.dados_acolhimento);
        }
      }
    } catch (err) {
      console.error("Error loading acolhimento:", err);
    } finally {
      setLoadingAcolhimento(false);
    }
  };

  const loadGroupActivity = async (patientId: string) => {
    setLoadingGroupActivity(true);
    try {
      const { data } = await supabase
        .from('prontuarios')
        .select('*')
        .eq('paciente_id', patientId)
        .eq('tipo_registro', 'oficina_terapeutica')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const typedData = data as any;
      if (typedData) {
        setGroupActivityData(typedData);
        if (typedData.custom_data) {
          setGroupActivityDraft({
            tema: typedData.custom_data.tema || '',
            tipo_atividade: typedData.custom_data.tipo_atividade || '',
            evolucao: typedData.evolucao || ''
          });
        }
      }
    } catch (err) {
      console.error("Error loading group activity:", err);
    } finally {
      setLoadingGroupActivity(false);
    }
  };

  const loadTriagem = async (agId: string) => {
    const { data } = await supabase.from("triage_records").select("*").eq("agendamento_id", agId).not("confirmado_em", "is", null).maybeSingle();
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
          loadAcolhimento(targetPacienteId);
          loadGroupActivity(targetPacienteId);

          const processProntuario = (p: any) => {
            if (p) {
              setForm((prev: any) => {
                return { ...prev, ...p, custom_data: { ...(prev.custom_data || {}), ...(p.custom_data || {}) } };
              });
              
              if (p.observacoes && p.observacoes.startsWith('{')) {
                try {
                  const parsedObs = JSON.parse(p.observacoes);
                  if (parsedObs.especialidade_fields) {
                    setEspecialidadeFields(parsedObs.especialidade_fields);
                  }
                  if (parsedObs.texto !== undefined) {
                    setForm((prev: any) => ({ ...prev, observacoes: parsedObs.texto || '' }));
                  }
                } catch (e) {
                  console.error("Error parsing observations for specialty fields", e);
                }
              }

              loadProntuarioProcedimentos(p.id);
              
              try {
                if (p.prescricao) {
                  const parsedPresc = JSON.parse(p.prescricao);
                  setListaPrescricao(parsedPresc.medicamentos || parsedPresc);
                }
                if (p.solicitacao_exames) {
                  const parsedExams = JSON.parse(p.solicitacao_exames);
                  setListaExames(parsedExams.exames || parsedExams);
                }
              } catch (e) { console.error("Error parsing prescriptions/exams", e); }
              
              if (p.custom_data?.soap_enabled !== undefined) {
                setSoapEnabled(p.custom_data.soap_enabled);
              }
            }
          };

          if (agendamentoId) {
            loadTriagem(agendamentoId);
            const { data: p } = await supabase.from('prontuarios').select('*').eq('agendamento_id', agendamentoId).maybeSingle();
            processProntuario(p);
          } else if (editId) {
            const { data: p } = await supabase.from('prontuarios').select('*').eq('id', editId).single();
            processProntuario(p);
            if ((p as any)?.agendamento_id) loadTriagem((p as any).agendamento_id);
          }
        }
      } finally { setLoading(false); }
    };
    loadData();
  }, [pacienteId, agendamentoId, editId, refreshTrigger]);

  useRealtimeSubscription({
    tables: ['treatment_cycles', 'treatment_sessions', 'pts'],
    filter: (pacienteId || form.paciente_id) ? `patient_id=eq.${pacienteId || form.paciente_id}` : undefined,
    enabled: !!(pacienteId || form.paciente_id),
    onchange: () => {
      const targetId = pacienteId || form.paciente_id;
      if (targetId) loadSessaoData(targetId);
    }
  });

  const handlePrint = async () => {
    const { data: carimbo } = await supabase
      .from('profissionais_carimbo')
      .select('*')
      .eq('profissional_id', user?.id)
      .maybeSingle();

    const meta = {
      'Paciente': pacienteData?.nome || pacienteNome || '—',
      'Idade': pacienteData?.data_nascimento ? calcularIdade(pacienteData.data_nascimento) : '—',
      'CPF': pacienteData?.cpf || '—',
      'CNS': pacienteData?.cns || '—',
      'Profissional': user?.nome || '—',
      'Data': form.data_atendimento ? new Date(form.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
      'Hora': form.hora_atendimento || '—',
      'Tipo': TIPO_REGISTRO_LABELS[form.tipo_registro as keyof typeof TIPO_REGISTRO_LABELS] || form.tipo_registro
    };
    let body = '';
    await openPrintDocument("Prontuário Clínico", body, meta);
  };

  const handleSave = async () => {
    // Basic implementation placeholder to avoid compile error
    setSaving(true);
    setTimeout(() => setSaving(false), 500);
  };
  
  const handleToggleSoap = (enabled: boolean) => {
    setSoapEnabled(enabled);
    setForm((prev: any) => ({
      ...prev,
      custom_data: {
        ...prev.custom_data,
        soap_enabled: enabled
      }
    }));
  };

  const handleSaveAcolhimento = async (dados: any) => {
    setSavingAcolhimento(true);
    try {
      const record = {
        paciente_id: pacienteId || form.paciente_id,
        paciente_nome: pacienteData?.nome || pacienteNome || '',
        profissional_id: user?.id || '',
        profissional_nome: user?.nome || '',
        unidade_id: user?.unidadeId || '',
        data_atendimento: form.data_atendimento || new Date().toISOString().split('T')[0],
        hora_atendimento: form.hora_atendimento || '',
        tipo_registro: 'acolhimento_mental',
        agendamento_id: agendamentoId || null,
        dados_acolhimento: dados,
        evolucao: dados?.secao15?.parecer || '',
        queixa_principal: dados?.secao3?.queixa || '',
      };

      if (acolhimentoData?.id) {
        const { error } = await (supabase as any).from('prontuarios').update(record).eq('id', acolhimentoData.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase as any).from('prontuarios').insert(record).select('id').single();
        if (error) throw error;
        setAcolhimentoData(inserted);
      }
      toast.success('Acolhimento salvo com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao salvar acolhimento: ' + (err?.message || ''));
    } finally {
      setSavingAcolhimento(false);
    }
  };

  const handleSaveGroupActivity = async (dados: any) => {
    setSavingGroupActivity(true);
    try {
      const record = {
        paciente_id: pacienteId || form.paciente_id,
        paciente_nome: pacienteData?.nome || pacienteNome || '',
        profissional_id: user?.id || '',
        profissional_nome: user?.nome || '',
        unidade_id: user?.unidadeId || '',
        data_atendimento: form.data_atendimento || new Date().toISOString().split('T')[0],
        hora_atendimento: form.hora_atendimento || '',
        tipo_registro: 'oficina_terapeutica',
        agendamento_id: agendamentoId || null,
        evolucao: dados?.evolucao || '',
        custom_data: {
          tema: dados?.tema || '',
          tipo_atividade: dados?.tipo_atividade || '',
        },
      };

      if (groupActivityData?.id) {
        const { error } = await (supabase as any).from('prontuarios').update(record).eq('id', groupActivityData.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase as any).from('prontuarios').insert(record).select('id').single();
        if (error) throw error;
        setGroupActivityData(inserted);
      }
      toast.success('Registro de grupo/oficina salvo com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao salvar registro: ' + (err?.message || ''));
    } finally {
      setSavingGroupActivity(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="px-6 py-4 flex items-center justify-between border-b bg-background shadow-sm z-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button>
          <h1 className="font-display font-bold text-lg">Prontuário Clínico</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gradient-primary">
            {saving ? 'Salvando...' : (editId ? 'Finalizar Alteração' : 'Finalizar Prontuário')}
          </Button>
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

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-2 border-b mb-4">
                    <TabsList className="flex-1 justify-start h-12 bg-transparent gap-6 p-0 overflow-x-auto">
                      {(prontuarioSections || [])
                        .filter(s => s.enabled && (s.tiposProntuario || []).includes(form.tipo_registro))
                        .sort((a, b) => a.order - b.order)
                        .map(section => (
                          <TabsTrigger 
                            key={section.id} 
                            value={section.standardTabId || section.id} 
                            className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold whitespace-nowrap"
                          >
                            {section.title}
                          </TabsTrigger>
                        ))
                      }
                    </TabsList>
                  </div>

                  {(prontuarioSections || [])
                    .filter(s => s.enabled && (s.tiposProntuario || []).includes(form.tipo_registro))
                    .sort((a, b) => a.order - b.order)
                    .map(section => {
                      const tabValue = section.standardTabId || section.id;
                      return (
                        <TabsContent key={section.id} value={tabValue} className="mt-0 animate-in fade-in duration-300" forceMount>
                          <div className={cn(activeTab !== tabValue && "hidden")}>
                            {section.type === 'custom' ? (
                              <Card className="border-border/50 shadow-sm">
                                <CardContent className="p-6">
                                  <DynamicProntuarioFields
                                    campos={section.fields.filter(f => f.enabled)}
                                    formValues={form}
                                    customValues={form.custom_data || {}}
                                    onFormChange={(k, v) => handleFormChange({ [k]: v })}
                                    onCustomChange={(k, v) => handleFormChange({ custom_data: { [k]: v } })}
                                  />
                                </CardContent>
                              </Card>
                            ) : (
                              <div className="space-y-6">
                                {section.standardTabId === 'acolhimento' && (
                                  <AcolhimentoForm 
                                    pacienteId={pacienteId || form.paciente_id}
                                    profissionalId={user?.id}
                                    agendamentoId={agendamentoId || undefined}
                                    initialData={acolhimentoData}
                                    formData={acolhimentoDraft}
                                    setFormData={setAcolhimentoDraft}
                                    onSave={handleSaveAcolhimento}
                                    saving={savingAcolhimento}
                                  />
                                )}
                                {section.standardTabId === 'group_activity' && (
                                  <GroupActivityForm 
                                    data={groupActivityDraft}
                                    onChange={(updates) => setGroupActivityDraft((prev: any) => ({ ...prev, ...updates }))}
                                    onSave={() => handleSaveGroupActivity(groupActivityDraft)}
                                    saving={savingGroupActivity}
                                  />
                                )}
                                {section.standardTabId === 'evolution' && (
                                  <div className="space-y-6">
                                    <SoapFieldsAdaptive
                                        profissao={user?.profissao}
                                        values={{
                                            soap_subjetivo: form.soap_subjetivo || '',
                                            soap_objetivo: form.soap_objetivo || '',
                                            soap_avaliacao: form.soap_avaliacao || '',
                                            soap_plano: form.soap_plano || '',
                                        }}
                                        onChange={(field, value) => handleFormChange({ [field]: value })}
                                        soapErrors={false}
                                        onClearErrors={() => {}}
                                        soapEnabled={soapEnabled}
                                        onToggleSoap={handleToggleSoap}
                                        labels={soapLabels}
                                        customOptionsForField={(field) => soapCustom.getOptionsForField(field)}
                                        customOptionsWithId={(field) => soapCustom.getOptionWithId(field)}
                                        onAddCustomOption={(field, option) => soapCustom.addOption(field, option, user?.profissao || '')}
                                        onDeleteCustomOption={soapCustom.deleteOption}
                                    />
                                    <DynamicProntuarioFields
                                        campos={[
                                            ...getCamposForTipo(form.tipo_registro),
                                            ...(section.fields || []).filter(f => f.enabled && !f.isBuiltin)
                                        ]}
                                        formValues={form}
                                        customValues={form.custom_data || {}}
                                        onFormChange={(k, v) => handleFormChange({ [k]: v })}
                                        onCustomChange={(k, v) => handleFormChange({ custom_data: { [k]: v } })}
                                    />
                                  </div>
                                )}
                                {section.standardTabId === 'prescriptions' && (
                                  <div className="space-y-6">
                                    <PrescricaoMedicamentos
                                      profissionalId={user?.id || ''}
                                      value={listaPrescricao}
                                      onChange={setListaPrescricao}
                                      pacienteNome={pacienteData?.nome || pacienteNome || ''}
                                      pacienteCpf={pacienteData?.cpf}
                                      pacienteCns={pacienteData?.cns}
                                      dataAtendimento={form.data_atendimento}
                                      profissionalNome={user?.nome}
                                      profissionalConselho={user?.numeroConselho}
                                      profissionalTipoConselho={user?.tipoConselho}
                                      profissionalUfConselho={user?.ufConselho}
                                    />
                                    <SolicitacaoExames
                                      profissionalId={user?.id || ''}
                                      value={listaExames}
                                      onChange={setListaExames}
                                      pacienteNome={pacienteData?.nome || pacienteNome || ''}
                                      pacienteCpf={pacienteData?.cpf}
                                      pacienteCns={pacienteData?.cns}
                                      dataAtendimento={form.data_atendimento}
                                      profissionalNome={user?.nome}
                                      profissionalConselho={user?.numeroConselho}
                                      profissionalTipoConselho={user?.tipoConselho}
                                      profissionalUfConselho={user?.ufConselho}
                                    />
                                  </div>
                                )}
                                {section.standardTabId === 'procedures' && (
                                  <div className="space-y-4">
                                    {user?.profissao && (
                                      <CamposEspecialidade
                                        profissao={user.profissao}
                                        profissionalId={user.id}
                                        tipoProntuario={form.tipo_registro as any}
                                        values={especialidadeFields}
                                        onChange={(key, val) => setEspecialidadeFields(prev => ({ ...prev, [key]: val }))}
                                      />
                                    )}
                                  </div>
                                )}
                                {section.standardTabId === 'treatments' && (
                                  <TreatmentTab
                                    pacienteId={pacienteId || form.paciente_id}
                                    pacienteNome={pacienteData?.nome || pacienteNome || ''}
                                    onCycleCreated={() => setCreateCycleOpen(true)}
                                    onPtsCreated={() => setCreatePtsOpen(true)}
                                  />
                                )}
                                {section.standardTabId === 'antecedents' && (
                                  <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">Histórico externo do paciente.</p>
                                  </div>
                                )}
                                {section.standardTabId === 'annexes' && (
                                  <div className="space-y-4">
                                    <ProntuarioAnexos
                                      prontuarioId={editId}
                                      pacienteId={pacienteId || form.paciente_id || ''}
                                      agendamentoId={agendamentoId || undefined}
                                      tipoRegistro={form.tipo_registro}
                                      unidadeId={user?.unidadeId || ''}
                                      uploadedBy={user?.id || ''}
                                      uploadedByNome={user?.nome || ''}
                                      showResultadosAnteriores={form.tipo_registro === 'retorno'}
                                      disabled={!(pacienteId || form.paciente_id)}
                                    />
                                    <ResultadosExames
                                      prontuarioId={editId}
                                      pacienteId={pacienteId || form.paciente_id || ''}
                                      agendamentoId={agendamentoId || undefined}
                                      tipoAtendimento={form.tipo_registro}
                                      unidadeId={user?.unidadeId || ''}
                                      uploadedBy={user?.id || ''}
                                      uploadedByNome={user?.nome || ''}
                                      disabled={!(pacienteId || form.paciente_id)}
                                    />
                                  </div>
                                )}
                                {/* Render custom fields for any standard section that has them */}
                                {section.fields && section.fields.filter(f => f.enabled && !f.isBuiltin).length > 0 && 
                                  !['evolution', 'acolhimento', 'group_activity', 'prescriptions', 'procedures', 'treatments', 'antecedents', 'annexes'].includes(section.standardTabId || '') && (
                                  <DynamicProntuarioFields
                                    campos={section.fields.filter(f => f.enabled && !f.isBuiltin)}
                                    formValues={form}
                                    customValues={form.custom_data || {}}
                                    onFormChange={(k, v) => handleFormChange({ [k]: v })}
                                    onCustomChange={(k, v) => handleFormChange({ custom_data: { [k]: v } })}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </TabsContent>
                      );
                    })}
                </Tabs>
              </div>
            </ScrollArea>
          </ResizablePanel>
          <ResizablePanel defaultSize={35} minSize={25}>
            <Tabs defaultValue="history" className="flex flex-col h-full">
              <div className="px-4 py-2 border-b bg-muted/30">
                <TabsList className="w-full h-9 bg-transparent p-0 gap-4">
                  <TabsTrigger value="history" className="flex-1 h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-xs font-bold uppercase tracking-wider">Histórico</TabsTrigger>
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

      <CreatePTSModal
        open={createPtsOpen}
        onOpenChange={setCreatePtsOpen}
        pacienteId={pacienteId || form.paciente_id}
        pacienteNome={pacienteData?.nome || pacienteNome || ''}
        onSuccess={() => {
          const targetId = pacienteId || form.paciente_id;
          if (targetId) loadSessaoData(targetId);
        }}
      />

      <CreateCycleModal
        open={createCycleOpen}
        onOpenChange={setCreateCycleOpen}
        pacienteId={pacienteId || form.paciente_id}
        pacienteNome={pacienteData?.nome || pacienteNome || ''}
        onSuccess={() => {
          const targetId = pacienteId || form.paciente_id;
          if (targetId) loadSessaoData(targetId);
        }}
      />
    </div>
  );
};

export default WorkspaceProntuario;
