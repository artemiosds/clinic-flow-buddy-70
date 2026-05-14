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
import { 
  History, 
  FileText, 
  User, 
  Activity, 
  ArrowLeft, 
  Save, 
  Printer, 
  Download,
  AlertTriangle,
  ChevronRight,
  Stethoscope,
  ClipboardList,
  Info,
  MapPin,
  Clock,
  LayoutDashboard,
  Search,
  Plus
} from 'lucide-react';

import PatientClinicalHeader from '@/components/pacientes/PatientClinicalHeader';
import { HistoricoClinico } from '@/components/HistoricoClinico';
import TriagemDetalhada from '@/components/TriagemDetalhada';
import DynamicProntuarioFields from '@/components/DynamicProntuarioFields';
import SoapFieldsAdaptive from '@/components/SoapFieldsAdaptive';
import { isMedico } from '@/data/soapOptionsByProfession';
import PacienteDocumentos from '@/components/PacienteDocumentos';
import { BuscaPaciente } from '@/components/BuscaPaciente';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Services
import { treatmentService, normalizeSoapPayload } from '@/services/treatmentService';

const calcularIdade = (dataNasc: string): string => {
  if (!dataNasc) return "—";
  const nascimento = new Date(dataNasc + "T12:00:00");
  if (isNaN(nascimento.getTime())) return "—";
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  const m = hoje.getMonth() - nascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) anos--;
  if (anos < 1) {
    let meses = (hoje.getFullYear() - nascimento.getFullYear()) * 12 + (hoje.getMonth() - nascimento.getMonth());
    if (hoje.getDate() < nascimento.getDate()) meses--;
    return meses <= 0 ? "< 1 mês" : `${meses} mes(es)`;
  }
  return `${anos} ano(s)`;
};

const WorkspaceProntuario: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { funcionarios, unidades, pacientes } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pacienteId = searchParams.get('pacienteId');
  const pacienteNome = searchParams.get('pacienteNome');
  const agendamentoId = searchParams.get('agendamentoId');
  const editId = searchParams.get('editId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triagem, setTriagem] = useState<any>(null);
  const [form, setForm] = useState<any>({
    tipo_registro: 'consulta',
    data_atendimento: new Date().toISOString().split('T')[0],
    hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    soap_subjetivo: '',
    soap_objetivo: '',
    soap_avaliacao: '',
    soap_plano: '',
    evolucao: '',
    queixa_principal: '',
    conduta: '',
    paciente_id: pacienteId || '',
    paciente_nome: pacienteNome || '',
    custom_data: {},
    agendamento_id: agendamentoId || '',
  });

  const { getEnabledFields } = useProntuarioStructure();
  const { getCamposForTipo } = useProntuarioTiposConfig();
  const { config: profConfig } = useProntuarioConfig(user?.id, form.tipo_registro);
  const soapCustom = useSoapCustomOptions(user?.id);

  const [pacienteData, setPacienteData] = useState<any>(null);

  // Load patient clinical data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const targetPacienteId = pacienteId || form.paciente_id;
        
        if (targetPacienteId) {
          // Load basic patient data
          const { data: pData } = await supabase
            .from('pacientes')
            .select('*')
            .eq('id', targetPacienteId)
            .single();
          
          if (pData) {
            setPacienteData(pData);
          }

          // Load triage if agendamentoId is present
          const targetAgendamentoId = agendamentoId || form.agendamento_id;
          if (targetAgendamentoId) {
            const { data: triagemData } = await supabase
              .from('triage_records')
              .select('*')
              .eq('agendamento_id', targetAgendamentoId)
              .maybeSingle();
            
            if (triagemData) {
              setTriagem(triagemData);
            }
          }

          if (agendamentoId) {
            const existingForAgendamento = await supabase
              .from('prontuarios')
              .select('*')
              .eq('agendamento_id', agendamentoId)
              .maybeSingle();

            if (existingForAgendamento.data) {
              const p = existingForAgendamento.data;
              setForm({
                paciente_id: p.paciente_id,
                paciente_nome: p.paciente_nome,
                agendamento_id: p.agendamento_id || "",
                data_atendimento: p.data_atendimento,
                hora_atendimento: p.hora_atendimento || "",
                tipo_registro: (p as any).tipo_registro || "consulta",
                queixa_principal: p.queixa_principal || "",
                anamnese: p.anamnese || "",
                sinais_sintomas: p.sinais_sintomas || "",
                exame_fisico: p.exame_fisico || "",
                hipotese: p.hipotese || "",
                conduta: p.conduta || "",
                prescricao: p.prescricao || "",
                solicitacao_exames: p.solicitacao_exames || "",
                evolucao: p.evolucao || "",
                observacoes: p.observacoes || "",
                indicacao_retorno: p.indicacao_retorno || "",
                procedimentos_texto: p.procedimentos_texto || "",
                outro_procedimento: p.outro_procedimento || "",
                episodio_id: p.episodio_id || "",
                soap_subjetivo: (p as any).soap_subjetivo || "",
                soap_objetivo: (p as any).soap_objetivo || "",
                soap_avaliacao: (p as any).soap_avaliacao || "",
                soap_plano: (p as any).soap_plano || "",
                custom_data: (p as any).custom_data || {},
              });
            }
          } else if (editId) {
            const { data: record } = await supabase
              .from('prontuarios')
              .select('*')
              .eq('id', editId)
              .single();
            
            if (record) {
              const p = record;
              setForm({
                paciente_id: p.paciente_id,
                paciente_nome: p.paciente_nome,
                agendamento_id: p.agendamento_id || "",
                data_atendimento: p.data_atendimento,
                hora_atendimento: p.hora_atendimento || "",
                tipo_registro: (p as any).tipo_registro || "consulta",
                queixa_principal: p.queixa_principal || "",
                anamnese: p.anamnese || "",
                sinais_sintomas: p.sinais_sintomas || "",
                exame_fisico: p.exame_fisico || "",
                hipotese: p.hipotese || "",
                conduta: p.conduta || "",
                prescricao: p.prescricao || "",
                solicitacao_exames: p.solicitacao_exames || "",
                evolucao: p.evolucao || "",
                observacoes: p.observacoes || "",
                indicacao_retorno: p.indicacao_retorno || "",
                procedimentos_texto: p.procedimentos_texto || "",
                outro_procedimento: p.outro_procedimento || "",
                episodio_id: p.episodio_id || "",
                soap_subjetivo: (p as any).soap_subjetivo || "",
                soap_objetivo: (p as any).soap_objetivo || "",
                soap_avaliacao: (p as any).soap_avaliacao || "",
                soap_plano: (p as any).soap_plano || "",
                custom_data: (p as any).custom_data || {},
              });
            }
          }
        }
      } catch (error) {
        console.error('Error loading prontuario data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [pacienteId, agendamentoId, editId, form.paciente_id, form.agendamento_id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dbPayload = {
        ...form,
        id: editId || undefined,
        agendamento_id: agendamentoId || form.agendamento_id || null,
        paciente_id: pacienteId || form.paciente_id,
        profissional_id: user?.id,
        profissional_nome: user?.nome,
        unidade_id: user?.unidadeId || '',
        data_atendimento: form.data_atendimento,
        hora_atendimento: form.hora_atendimento,
      };

      const { data, error } = await supabase
        .from('prontuarios')
        .upsert(dbPayload)
        .select()
        .single();

      if (error) throw error;
      toast.success('Prontuário salvo com sucesso!');
      
      const effectiveAgendamentoId = agendamentoId || form.agendamento_id;
      if (effectiveAgendamentoId) {
        await supabase
          .from('agendamentos')
          .update({ status: 'concluido' })
          .eq('id', effectiveAgendamentoId);
      }

      if (!editId) {
        navigate(`/painel/workspace-prontuario?pacienteId=${pacienteId || form.paciente_id}&pacienteNome=${encodeURIComponent(pacienteNome || form.paciente_nome)}&editId=${data.id}`);
      }
    } catch (error) {
      console.error('Error saving prontuário:', error);
      toast.error('Erro ao salvar prontuário');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Clinician Header Bar - Professional, High-Density */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b bg-card shrink-0 z-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 h-9 px-3">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
          <div className="h-6 w-px bg-border mx-1" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Stethoscope className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display leading-none">Workspace Clínico</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 font-semibold">
                {editId ? 'Edição de Prontuário' : 'Novo Atendimento'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 h-9">
            <Printer className="w-4 h-4" />
            <span className="hidden md:inline">Imprimir</span>
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2 h-9 px-4 gradient-primary shadow-sm shadow-primary/20">
            <Save className="w-4 h-4" />
            <span>{saving ? 'Salvando...' : 'Finalizar Atendimento'}</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Content Area: High-focus Clinical Editor */}
        <main className="flex-1 flex flex-col min-w-0 bg-muted/10 relative overflow-hidden">
          <ScrollArea className="flex-1 h-full">
            <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 pb-24">
              
              {/* Clinical Patient Header - Compact & Intelligent */}
              <PatientClinicalHeader
                nome={pacienteData?.nome || pacienteNome || 'Paciente não identificado'}
                idade={pacienteData?.data_nascimento ? calcularIdade(pacienteData.data_nascimento) : '—'}
                dataNasc={pacienteData?.data_nascimento}
                numeroProntuario={pacienteData?.id?.slice(0, 8)}
                sexo={(() => {
                  const s = pacienteData?.custom_data?.sexo || pacienteData?.sexo;
                  if (!s) return "—";
                  const val = String(s).toUpperCase();
                  if (val === 'M' || val === 'MASCULINO') return 'Masculino';
                  if (val === 'F' || val === 'FEMININO') return 'Feminino';
                  if (val === 'I' || val === 'IGNORADO') return 'Ignorado';
                  return s;
                })()}
                cpf={pacienteData?.cpf || '—'}
                cns={pacienteData?.cns || '—'}
                profissional={user?.nome || '—'}
                alertas={triagem?.alergias?.length > 0 ? ['Alergias Detectadas'] : []}
                risco={triagem?.prioridade === 'urgente' ? 'alto' : triagem?.prioridade === 'gestante' ? 'medio' : 'baixo'}
              />

              {/* Selector for new clinical record if no patient is loaded via URL */}
              {(!pacienteId && !editId) && (
                <Card className="border-primary/20 bg-primary/[0.02]">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                       <User className="w-5 h-5 text-primary" />
                       <h3 className="font-bold text-foreground">Identificação do Paciente</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Buscar Paciente</Label>
                        <BuscaPaciente
                          pacientes={pacientes}
                          value={form.paciente_id}
                          onChange={(id, nome) => {
                            setForm(prev => ({ ...prev, paciente_id: id, paciente_nome: nome }));
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label>Data</Label>
                          <Input type="date" value={form.data_atendimento} onChange={(e) => setForm(p => ({...p, data_atendimento: e.target.value}))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Hora</Label>
                          <Input type="time" value={form.hora_atendimento} onChange={(e) => setForm(p => ({...p, hora_atendimento: e.target.value}))} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Clinical Overview Bar - Key Stats at a glance */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div className="p-3.5 rounded-xl border bg-card/50 flex items-center gap-3.5 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest leading-tight">Origem</p>
                    <p className="text-xs font-bold truncate mt-0.5">{pacienteData?.municipio || '—'}</p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl border bg-card/50 flex items-center gap-3.5 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest leading-tight">Vínculo</p>
                    <p className="text-xs font-bold truncate mt-0.5">{pacienteData?.unidade_vinculo || 'Não vinculado'}</p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl border bg-card/50 flex items-center gap-3.5 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest leading-tight">Status Clínico</p>
                    <p className="text-xs font-bold truncate mt-0.5">Ativo</p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl border bg-card/50 flex items-center gap-3.5 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest leading-tight">Especialidade</p>
                    <p className="text-xs font-bold truncate mt-0.5">{pacienteData?.especialidade_destino || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Triage summary if available - Detailed & Hospital Grade */}
              {triagem && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                  <TriagemDetalhada triagem={triagem} showEmpty={false} />
                </div>
              )}

              {/* Evolution Workspace - Maximum Area for Writing */}
              <div className="bg-card rounded-2xl border shadow-sm overflow-hidden ring-1 ring-border/50">
                <div className="bg-muted/30 border-b px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">Registro de Evolução Atual</h2>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-semibold">
                         <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Atendimento em {form.data_atendimento} às {form.hora_atendimento}</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] px-2 h-6 uppercase font-bold">Modo Edição</Badge>
                </div>
                
                <div className="p-6 md:p-8 space-y-8">
                  {/* SOAP Editor - Adaptive & Professional */}
                  <div className="space-y-6">
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
                  </div>

                  <Separator className="opacity-50" />

                  {/* Complementary Sections */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                       <Activity className="w-4 h-4 text-primary" />
                       <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Conduta e Prescrição Complementar</h3>
                    </div>
                    <DynamicProntuarioFields
                      campos={getCamposForTipo(form.tipo_registro)}
                      formValues={form}
                      customValues={form.custom_data || {}}
                      onFormChange={(key, val) => setForm(prev => ({ ...prev, [key]: val }))}
                      onCustomChange={(key, val) => setForm(prev => ({ 
                        ...prev, 
                        custom_data: { ...(prev.custom_data || {}), [key]: val } 
                      }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </main>

        {/* Longitudinal History Panel - Integrated Hospital Sidebar */}
        <aside className="w-[440px] shrink-0 bg-background border-l flex flex-col hidden lg:flex z-10 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] overflow-hidden">
          <Tabs defaultValue="history" className="flex flex-col h-full">
            <div className="px-4 py-3.5 bg-muted/20 border-b">
              <TabsList className="grid grid-cols-2 w-full h-10 p-1 bg-background border rounded-lg">
                <TabsTrigger value="history" className="gap-2 text-[11px] font-bold uppercase tracking-tighter data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <History className="w-3.5 h-3.5" />
                  Prontuário Longitudinal
                </TabsTrigger>
                <TabsTrigger value="documents" className="gap-2 text-[11px] font-bold uppercase tracking-tighter data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <FileText className="w-3.5 h-3.5" />
                  Repositório de Exames
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="history" className="flex-1 overflow-hidden m-0 relative">
              <div className="flex flex-col h-full bg-muted/5">
                <div className="p-4 py-2.5 border-b bg-card/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Histórico Longitudinal</h3>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-bold tracking-tighter uppercase px-1.5 h-5 border-primary/20 text-primary bg-primary/5">Timeline Ativa</Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 pb-12">
                    {(pacienteId || form.paciente_id) ? (
                      <HistoricoClinico
                        pacienteId={(pacienteId || form.paciente_id)!}
                        pacienteNome={pacienteNome || form.paciente_nome || ''}
                        currentProfissionalId={user?.id}
                        unidades={unidades}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                        <Search className="w-10 h-10 text-muted-foreground/30 mb-4" />
                        <p className="text-sm text-muted-foreground font-medium">Selecione um paciente para visualizar o histórico longitudinal completo.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="flex-1 overflow-hidden m-0">
               <div className="flex flex-col h-full bg-muted/5">
                 <div className="p-4 py-2.5 border-b bg-card flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                   <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Documentos e Anexos</h3>
                 </div>
                 <ScrollArea className="flex-1">
                   <div className="p-4 pb-12">
                     {(pacienteId || form.paciente_id) && (
                       <PacienteDocumentos pacienteId={(pacienteId || form.paciente_id)!} />
                     )}
                   </div>
                 </ScrollArea>
               </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
};

export default WorkspaceProntuario;
