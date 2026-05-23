import { PageHeader } from '@/components/layout/PageHeader';
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import FichaPacienteCabecalho from "@/components/FichaPacienteCabecalho";
import { useProntuarioStructure } from "@/hooks/useProntuarioStructure";
import { useProntuarioTiposConfig } from "@/hooks/useProntuarioTiposConfig";
import { useProntuarioConfig } from "@/hooks/useProntuarioConfig";
import { useSoapCustomOptions } from "@/hooks/useSoapCustomOptions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  Calendar, Info, AlertTriangle, FileDown
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { TIPO_REGISTRO_LABELS } from '@/utils/labels';

import PatientClinicalHeader from '@/components/pacientes/PatientClinicalHeader';
import { HistoricoClinico } from '@/components/HistoricoClinico';
import TriagemDetalhada from '@/components/TriagemDetalhada';
import DynamicProntuarioFields from '@/components/DynamicProntuarioFields';
import SoapFieldsAdaptive from '@/components/SoapFieldsAdaptive';
import PacienteDocumentos from '@/components/PacienteDocumentos';
import { AcolhimentoForm } from '@/components/prontuario/AcolhimentoForm';
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
import { openPrintDocument } from '@/lib/printLayout';
import { downloadProntuarioPdf } from '@/lib/prontuarioPdf';
import { Lock } from 'lucide-react';
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
  const [triagem, setTriagem] = useState<any>(null);
  const [pacienteData, setPacienteData] = useState<any>(null);
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('evolution');

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
  });

  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  const handleFormChange = (updates: any) => {
    setForm((prev: any) => {
      const next = { ...prev, ...updates };
      if (updates.id && !prev.id) next.id = updates.id;
      return next;
    });
    setHasModifiedForm(true);
  };

  const [soapEnabled, setSoapEnabled] = useState(true);
  const { soapLabels } = useProntuarioTiposConfig();
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
    } catch (err) { console.error("Error loading acolhimento:", err); }
    finally { setLoadingAcolhimento(false); }
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
          loadAcolhimento(targetPacienteId);

          const processProntuario = (p: any) => {
            if (p) {
              setForm(prev => ({ ...p, ...prev, id: p.id }));
              
              if (p.observacoes && p.observacoes.startsWith('{')) {
                try {
                  const parsedObs = JSON.parse(p.observacoes);
                  if (parsedObs.especialidade_fields) {
                    setEspecialidadeFields(parsedObs.especialidade_fields);
                  }
                } catch (e) { console.error("Error parsing observations", e); }
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
            if (p?.agendamento_id) loadTriagem(p.agendamento_id);
          }
        }
      } finally { setLoading(false); }
    };
    loadData();
  }, [pacienteId, agendamentoId, editId, refreshTrigger]);

  const handleSave = async () => {
    if (!formRef.current.paciente_id) {
      toast.error("Identifique o paciente antes de salvar.");
      return;
    }
    
    setSaving(true);
    try {
      const { auditService } = await import('@/services/auditService');
      const finalId = editId || formRef.current.id;
      let currentProntuario = null;
      
      if (finalId) {
        const { data: old } = await supabase.from('prontuarios').select('*').eq('id', finalId).maybeSingle();
        currentProntuario = old;
      }

      const dbPayload: any = {
        paciente_id: formRef.current.paciente_id,
        paciente_nome: formRef.current.paciente_nome,
        profissional_id: user?.id,
        profissional_nome: user?.nome,
        unidade_id: user?.unidadeId || '',
        setor: user?.setor || '',
        agendamento_id: formRef.current.agendamento_id || null,
        data_atendimento: formRef.current.data_atendimento,
        hora_atendimento: formRef.current.hora_atendimento,
        queixa_principal: formRef.current.queixa_principal || '',
        anamnese: formRef.current.anamnese || '',
        sinais_sintomas: formRef.current.sinais_sintomas || '',
        exame_fisico: formRef.current.exame_fisico || '',
        hipotese: formRef.current.hipotese || '',
        conduta: formRef.current.conduta || '',
        prescricao: listaPrescricao.length > 0 ? JSON.stringify({ medicamentos: listaPrescricao }) : formRef.current.prescricao,
        solicitacao_exames: listaExames.length > 0 ? JSON.stringify({ exames: listaExames }) : formRef.current.solicitacao_exames,
        evolucao: formRef.current.evolucao || '',
        observacoes: Object.keys(especialidadeFields).length > 0
          ? JSON.stringify({ especialidade_fields: especialidadeFields, texto: formRef.current.observacoes || '' })
          : formRef.current.observacoes || '',
        indicacao_retorno: formRef.current.indicacao_retorno === 'no_indication' ? '' : (formRef.current.indicacao_retorno || ''),
        motivo_alteracao: finalId ? (formRef.current.motivo_alteracao || 'Alteração via Workspace') : '',
        procedimentos_texto: formRef.current.procedimentos_texto || '',
        outro_procedimento: formRef.current.outro_procedimento || '',
        tipo_registro: formRef.current.tipo_registro || 'consulta',
        soap_subjetivo: formRef.current.soap_subjetivo || '',
        soap_objetivo: formRef.current.soap_objetivo || '',
        soap_avaliacao: formRef.current.soap_avaliacao || '',
        soap_plano: formRef.current.soap_plano || '',
        episodio_id: (formRef.current.episodio_id && formRef.current.episodio_id !== 'no_episode') ? formRef.current.episodio_id : null,
        custom_data: {
          ...formRef.current.custom_data,
          soap_enabled: soapEnabled
        }
      };

      let resultData;
      if (finalId) {
        const { data, error } = await supabase.from('prontuarios').update(dbPayload).eq('id', finalId).select().single();
        if (error) throw error;
        resultData = data;
      } else {
        const { data, error } = await supabase.from('prontuarios').insert(dbPayload).select().single();
        if (error) throw error;
        resultData = data;
      }
      
      const data = resultData;
      await auditService.log({
        acao: finalId ? 'finalizar_alteracao_prontuario' : 'finalizar_prontuario',
        entidade: 'prontuario',
        entidadeId: data.id,
        entidadeNome: pacienteData?.nome || pacienteNome || 'Paciente',
        modulo: 'Prontuário',
        before: currentProntuario,
        after: data,
        pacienteId: pacienteId || formRef.current.paciente_id,
        origem: 'Workspace Prontuário'
      });

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
            paciente_id: formRef.current.paciente_id,
            agendamento_id: formRef.current.agendamento_id || null,
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

      if (formRef.current.agendamento_id) {
        await updateAgendamento(formRef.current.agendamento_id, { status: 'concluido' });
      }

      toast.success(finalId ? 'Alteração finalizada com sucesso!' : 'Prontuário finalizado com sucesso!');
      setTimeout(() => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/painel/agenda');
      }, 300);
    } catch (e: any) { 
      console.error('[Prontuário] Erro ao salvar:', e);
      toast.error(`Erro ao salvar prontuário: ${e?.message || 'desconhecido'}`); 
    } finally { setSaving(false); }
  };

  const handlePrint = async () => {
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
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gradient-primary">
            {saving ? 'Salvando...' : (editId || form.id ? 'Finalizar Alteração' : 'Finalizar Prontuário')}
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
                />
                
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-2 border-b mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <TabsList className="flex-1 justify-start h-12 bg-transparent gap-6 p-0 overflow-x-auto">
                        <TabsTrigger value="evolution" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold">Evolução</TabsTrigger>
                        <TabsTrigger value="acolhimento" className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 text-sm font-semibold">Acolhimento</TabsTrigger>
                      </TabsList>
                    </div>
                  </div>

                  <TabsContent value="evolution" className="space-y-4 mt-4">
                    <SoapFieldsAdaptive
                      profissao={user?.profissao}
                      values={{
                        soap_subjetivo: form.soap_subjetivo,
                        soap_objetivo: form.soap_objetivo,
                        soap_avaliacao: form.soap_avaliacao,
                        soap_plano: form.soap_plano,
                      }}
                      onChange={(field, value) => handleFormChange({ [field]: value })}
                      soapErrors={false}
                      onClearErrors={() => {}}
                      soapEnabled={soapEnabled}
                      onToggleSoap={setSoapEnabled}
                      labels={soapLabels}
                    />
                    <Card className="p-4 space-y-4">
                       <Label>Queixa Principal</Label>
                       <DebouncedTextarea value={form.queixa_principal} onChange={(e) => handleFormChange({queixa_principal: e.target.value})} />
                    </Card>
                  </TabsContent>
                  <TabsContent value="acolhimento">
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={30}>
            <div className="h-full border-l bg-muted/10 p-4">
               <h2 className="font-bold mb-4 flex items-center gap-2"><History className="w-4 h-4" /> Histórico</h2>
               <HistoricoClinico pacienteId={form.paciente_id} pacienteNome={form.paciente_nome} unidades={unidades} currentProfissionalId={user?.id} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default WorkspaceProntuario;
