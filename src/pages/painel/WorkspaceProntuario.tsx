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
  Stethoscope, ClipboardList, Clock, Search, UserCog, Stamp, Trash2
} from 'lucide-react';

import PatientClinicalHeader from '@/components/pacientes/PatientClinicalHeader';
import { HistoricoClinico } from '@/components/HistoricoClinico';
import TriagemDetalhada from '@/components/TriagemDetalhada';
import DynamicProntuarioFields from '@/components/DynamicProntuarioFields';
import SoapFieldsAdaptive from '@/components/SoapFieldsAdaptive';
import PacienteDocumentos from '@/components/PacienteDocumentos';
import { BuscaPaciente } from '@/components/BuscaPaciente';
import QuickEditPatientModal from '@/components/pacientes/QuickEditPatientModal';
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
    tipo_registro: searchParams.get('tipo') || 'consulta',
    data_atendimento: searchParams.get('data') || new Date().toISOString().split('T')[0],
    hora_atendimento: searchParams.get('horaInicio') || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    soap_subjetivo: '', soap_objetivo: '', soap_avaliacao: '', soap_plano: '',
    evolucao: '', queixa_principal: '', conduta: '',
    paciente_id: pacienteId || '',
    paciente_nome: pacienteNome || '',
    custom_data: {},
    agendamento_id: agendamentoId || '',
  });

  const { getCamposForTipo } = useProntuarioTiposConfig();
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

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const targetPacienteId = pacienteId || form.paciente_id;
        if (targetPacienteId) {
          const { data: pData } = await supabase.from('pacientes').select('*').eq('id', targetPacienteId).single();
          if (pData) setPacienteData(pData);

          if (agendamentoId) {
            const { data: p } = await supabase.from('prontuarios').select('*').eq('agendamento_id', agendamentoId).maybeSingle();
            if (p) setForm(prev => ({ ...prev, ...p }));
          } else if (editId) {
            const { data: p } = await supabase.from('prontuarios').select('*').eq('id', editId).single();
            if (p) setForm(prev => ({ ...prev, ...p }));
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
        id: editId || undefined,
        profissional_id: user?.id,
        profissional_nome: user?.nome,
        unidade_id: user?.unidadeId || '',
      };
      const { data, error } = await supabase.from('prontuarios').upsert(dbPayload).select().single();
      if (error) throw error;
      toast.success('Prontuário salvo com sucesso!');
      if (!editId) navigate(`/painel/workspace-prontuario?pacienteId=${pacienteId || form.paciente_id}&editId=${data.id}`);
    } catch (e) { toast.error('Erro ao salvar prontuário'); } finally { setSaving(false); }
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
                />

                {(!pacienteId && !editId) && (
                  <Card className="p-4 space-y-4">
                    <Label>Identificar Paciente</Label>
                    <BuscaPaciente pacientes={pacientes} value={form.paciente_id} onChange={(id, nome) => setForm(p => ({...p, paciente_id: id, paciente_nome: nome}))} />
                  </Card>
                )}

                <Tabs defaultValue="evolution" className="w-full">
                  <TabsList>
                    <TabsTrigger value="evolution">Evolução</TabsTrigger>
                    <TabsTrigger value="procedures">Procedimentos/CID</TabsTrigger>
                    <TabsTrigger value="documents">Documentos</TabsTrigger>
                  </TabsList>
                  <TabsContent value="evolution" className="mt-4">
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
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={30}>
            <Tabs defaultValue="history" className="h-full">
              <TabsList className="w-full">
                <TabsTrigger value="history" className="flex-1">Histórico</TabsTrigger>
                <TabsTrigger value="files" className="flex-1">Arquivos</TabsTrigger>
              </TabsList>
              <TabsContent value="history" className="h-[calc(100%-40px)] overflow-hidden">
                <ScrollArea className="h-full p-4">
                   {(pacienteId || form.paciente_id) && (
                     <HistoricoClinico 
                       pacienteId={pacienteId || form.paciente_id} 
                       pacienteNome={pacienteNome || form.paciente_nome || ''} 
                       unidades={unidades}
                       currentProfissionalId={user?.id}
                     />
                   )}
                </ScrollArea>
              </TabsContent>

            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <QuickEditPatientModal
        open={editPatientOpen}
        onOpenChange={setEditPatientOpen}
        pacienteId={pacienteId || form.paciente_id}
        onSaved={() => { setRefreshTrigger(r => r + 1); setEditPatientOpen(false); }}
      />
    </div>
  );
};

export default WorkspaceProntuario;
